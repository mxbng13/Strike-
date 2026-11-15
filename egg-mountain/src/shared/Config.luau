-- EGG MOUNTAIN — Configuration centrale (partagée serveur + client)
-- Tous les réglages d'équilibrage sont ici. Les identifiants Robux arriveront en phase 6.

local Config = {}

Config.VERSION = "0.1-prototype"
Config.DATASTORE_NAME = "EggMountain_v1"

-- Œuf
Config.EGG_MAX_HEALTH = 100
Config.EGG_SIZE = 1.8 -- diamètre de la boule physique (le visuel est étiré en hauteur)
Config.EGG_CARRY_OFFSET = CFrame.new(0, 0.4, -1.8) -- position de l'œuf devant le joueur
Config.RESPAWN_DELAY = 2

-- Chute du joueur qui porte l'œuf (vitesse verticale à l'atterrissage, en studs/s)
-- Un saut normal atterrit à environ 53 studs/s, donc on ne compte qu'au-delà de 62.
Config.CARRY_IMPACT_THRESHOLD = 62
Config.CARRY_IMPACT_DAMAGE = 1.4 -- dégâts par studs/s au-dessus du seuil

-- Œuf posé ou tombé par terre (plus fragile)
Config.LOOSE_IMPACT_THRESHOLD = 30
Config.LOOSE_IMPACT_DAMAGE = 1.6

-- Stabilité (0 = parfaitement stable, 100 = l'œuf glisse des mains)
Config.WOBBLE_DROP_AT = 100
Config.WOBBLE_DECAY = 22 -- points récupérés par seconde
Config.WOBBLE_PER_SPEED_CHANGE = 1.1 -- par stud/s de changement brusque de vitesse horizontale
Config.WOBBLE_SPEED_CHANGE_MIN = 5 -- en dessous, on ignore (marche normale)
Config.WOBBLE_JUMP = 9
Config.WOBBLE_WIND_PER_SEC = 30

-- Obstacles
Config.LOG_DAMAGE = 22
Config.LOG_WOBBLE = 55
Config.SWEEPER_DAMAGE = 6
Config.SWEEPER_WOBBLE = 45

-- Règle de casse : false = on repart du dernier checkpoint avec un œuf neuf
-- true = retour au camp (prévu pour les difficultés supérieures)
Config.BREAK_SENDS_TO_CAMP = false

-- Économie (EGG COINS) et XP
Config.COINS_CHECKPOINT = 25
Config.COINS_DELIVERY = 150
Config.COINS_PERFECT_BONUS = 100 -- œuf livré à 100 %
Config.XP_CHECKPOINT = 20
Config.XP_DELIVERY = 120
Config.MAX_LEVEL = 100

function Config.xpForLevel(level: number): number
	return math.floor(100 * level ^ 1.35)
end

function Config.eggStateName(health: number): string
	if health >= 100 then
		return "Intact"
	elseif health >= 70 then
		return "Légèrement fissuré"
	elseif health >= 35 then
		return "Fissuré"
	elseif health > 0 then
		return "Très fissuré !"
	end
	return "Cassé"
end

return Config
