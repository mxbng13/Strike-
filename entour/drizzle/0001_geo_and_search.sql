-- Extensions standard (contrib) : disponibles chez tous les hébergeurs PostgreSQL (Supabase, Neon, RDS, Scaleway…)
CREATE EXTENSION IF NOT EXISTS cube;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS earthdistance;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- Recherches par rayon : index GiST sur la position floutée (jamais sur l'adresse exacte)
CREATE INDEX IF NOT EXISTS services_geo_idx ON services USING gist (ll_to_earth(public_lat, public_lng)) WHERE status = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_locations_geo_idx ON user_locations USING gist (ll_to_earth(lat, lng));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_geo_idx ON posts USING gist (ll_to_earth(public_lat, public_lng));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS groups_geo_idx ON groups USING gist (ll_to_earth(lat, lng));--> statement-breakpoint

-- Recherche plein texte tolérante aux fautes sur les annonces
CREATE INDEX IF NOT EXISTS services_title_trgm_idx ON services USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS services_fts_idx ON services USING gin (to_tsvector('french', title || ' ' || description));--> statement-breakpoint

-- Journal d'administration : en ajout seul (aucune modification ni suppression possible)
CREATE OR REPLACE FUNCTION entour_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % en ajout seul', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS admin_logs_append_only ON admin_logs;--> statement-breakpoint
CREATE TRIGGER admin_logs_append_only BEFORE UPDATE OR DELETE ON admin_logs FOR EACH ROW EXECUTE FUNCTION entour_forbid_change();--> statement-breakpoint

-- Date de naissance immuable une fois le compte créé (empêche le contournement de la restriction d'âge).
-- Seule une vérification d'identité approuvée peut la corriger (variable de session entour.allow_birthdate_change).
CREATE OR REPLACE FUNCTION entour_protect_birth_date() RETURNS trigger AS $$
BEGIN
  IF NEW.birth_date IS DISTINCT FROM OLD.birth_date AND coalesce(current_setting('entour.allow_birthdate_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'La date de naissance ne peut pas être modifiée';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS users_birth_date_guard ON users;--> statement-breakpoint
CREATE TRIGGER users_birth_date_guard BEFORE UPDATE OF birth_date ON users FOR EACH ROW EXECUTE FUNCTION entour_protect_birth_date();--> statement-breakpoint

-- Une mission ne peut jamais avoir plus d'intervenants actifs que de places (dernier rempart, en plus du verrou applicatif).
CREATE OR REPLACE FUNCTION entour_check_assignment_capacity() RETURNS trigger AS $$
DECLARE
  needed int;
  active int;
BEGIN
  SELECT people_needed INTO needed FROM services WHERE id = NEW.service_id FOR UPDATE;
  SELECT count(*) INTO active FROM service_assignments
    WHERE service_id = NEW.service_id AND status NOT IN ('cancelled') AND id <> NEW.id;
  IF NEW.status <> 'cancelled' AND active >= needed THEN
    RAISE EXCEPTION 'capacity_reached' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS service_assignments_capacity ON service_assignments;--> statement-breakpoint
CREATE TRIGGER service_assignments_capacity BEFORE INSERT ON service_assignments FOR EACH ROW EXECUTE FUNCTION entour_check_assignment_capacity();
