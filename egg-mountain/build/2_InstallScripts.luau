-- EGG MOUNTAIN — Script 2/2 : installe tous les scripts du jeu (à coller dans la barre de commandes)
-- Fichier généré automatiquement par tools/make_installer.py — ne pas modifier à la main.
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local SPS = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
for _, c in ipairs({ RS:FindFirstChild("EggMountain"), SSS:FindFirstChild("EggMountain"), SPS:FindFirstChild("EggMountainClient") }) do
	if c then c:Destroy() end
end
local shared = Instance.new("Folder")
shared.Name = "EggMountain"
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = shared
for _, n in ipairs({ "Notify", "EggAction", "IntroDone" }) do
	local r = Instance.new("RemoteEvent")
	r.Name = n
	r.Parent = remotes
end
local server = Instance.new("Folder")
server.Name = "EggMountain"
local client = SPS
local function add(className, name, parent, source)
	local s = Instance.new(className)
	s.Name = name
	s.Source = source
	s.Parent = parent
end
add("ModuleScript", "Config", shared, [=[
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
]=])
add("ModuleScript", "DataManager", server, [=[
-- EGG MOUNTAIN — DataManager : sauvegarde des joueurs (DataStoreService)
-- Chargement avec réessais, sauvegarde auto, sauvegarde à la déconnexion et à la fermeture.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("EggMountain"):WaitForChild("Config"))

local DataManager = {}

local DEFAULT = {
	coins = 0,
	xp = 0,
	level = 1,
	checkpoint = 0, -- dernier checkpoint de l'ascension en cours
	runActive = false,
	delivered = 0,
	perfectDeliveries = 0,
	bestTime = 0, -- 0 = pas encore de record
	introSeen = false,
}

local store = nil
local okStore = pcall(function()
	store = DataStoreService:GetDataStore(Config.DATASTORE_NAME)
end)
if not okStore then
	warn("[EggMountain] DataStore indisponible : la progression ne sera pas sauvegardée.",
		"Active 'Game Settings > Security > Enable Studio Access to API Services' et publie le jeu.")
end

local profiles: { [Player]: any } = {}
local loaded: { [Player]: boolean } = {}

local function copyDefaults(data)
	local result = {}
	for k, v in pairs(DEFAULT) do
		result[k] = v
	end
	if type(data) == "table" then
		for k, v in pairs(data) do
			if DEFAULT[k] ~= nil and type(v) == type(DEFAULT[k]) then
				result[k] = v
			end
		end
	end
	-- Vérification des données
	result.coins = math.max(0, math.floor(result.coins))
	result.level = math.clamp(math.floor(result.level), 1, Config.MAX_LEVEL)
	result.xp = math.max(0, math.floor(result.xp))
	result.checkpoint = math.max(0, math.floor(result.checkpoint))
	return result
end

local function isAccessError(err): boolean
	local msg = string.lower(tostring(err))
	return string.find(msg, "studio", 1, true) ~= nil
		or string.find(msg, "403", 1, true) ~= nil
		or string.find(msg, "publish", 1, true) ~= nil
		or string.find(msg, "not allowed", 1, true) ~= nil
end

local function withRetry(fn)
	local lastErr
	for attempt = 1, 4 do
		if not store then
			return false, "DataStore désactivé"
		end
		local ok, res = pcall(fn)
		if ok then
			return true, res
		end
		lastErr = res
		if isAccessError(res) then
			-- Jeu non publié ou accès API désactivé dans Studio : inutile de réessayer
			warn("[EggMountain] Sauvegarde désactivée pour cette session :", res)
			store = nil
			return false, res
		end
		task.wait(attempt * 1.5)
	end
	return false, lastErr
end

function DataManager.load(player: Player)
	local data = nil
	if store then
		local ok, res = withRetry(function()
			return store:GetAsync("p_" .. player.UserId)
		end)
		if ok then
			data = res
		else
			warn("[EggMountain] Échec du chargement pour", player.Name, res)
		end
	end
	profiles[player] = copyDefaults(data)
	loaded[player] = true
	return profiles[player]
end

function DataManager.get(player: Player)
	return profiles[player]
end

function DataManager.save(player: Player)
	local data = profiles[player]
	if not data or not store or not loaded[player] then
		return
	end
	local ok, err = withRetry(function()
		store:UpdateAsync("p_" .. player.UserId, function()
			return data
		end)
	end)
	if not ok then
		warn("[EggMountain] Échec de la sauvegarde pour", player.Name, err)
	end
end

function DataManager.release(player: Player)
	DataManager.save(player)
	profiles[player] = nil
	loaded[player] = nil
end

-- Sauvegarde automatique toutes les 90 secondes
task.spawn(function()
	while true do
		task.wait(90)
		for player in pairs(profiles) do
			task.spawn(DataManager.save, player)
		end
	end
end)

game:BindToClose(function()
	if RunService:IsStudio() and not store then
		return
	end
	local pending = 0
	for _, player in ipairs(Players:GetPlayers()) do
		pending += 1
		task.spawn(function()
			DataManager.save(player)
			pending -= 1
		end)
	end
	local start = os.clock()
	while pending > 0 and os.clock() - start < 20 do
		task.wait(0.2)
	end
end)

return DataManager
]=])
add("ModuleScript", "EggSystem", server, [=[
-- EGG MOUNTAIN — EggSystem : l'œuf physique, ses dégâts et sa stabilité.
-- Tout est calculé par le serveur : le client ne fait qu'afficher.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("EggMountain"):WaitForChild("Config"))

local EggSystem = {}
EggSystem.onBroken = nil :: ((Player, string) -> ())?
EggSystem.notify = nil :: ((Player, string, string) -> ())?

local eggFolder = Instance.new("Folder")
eggFolder.Name = "EggMountainEggs"
eggFolder.Parent = workspace

local states: { [Player]: any } = {}
local windZones: { BasePart } = {}

local SOUND_HIT = "rbxasset://sounds/action_jump_land.mp3"
local SOUND_DROP = "rbxasset://sounds/swoosh.wav"

local function notify(player, text, kind)
	if EggSystem.notify then
		EggSystem.notify(player, text, kind or "info")
	end
end

local function getState(player: Player)
	local s = states[player]
	if not s then
		s = {
			egg = nil,
			health = Config.EGG_MAX_HEALTH,
			wobble = 0,
			carrying = false,
			lastVy = 0,
			lastHv = Vector3.zero,
			lastLooseVy = 0,
			cooldowns = {},
			attrTimer = 0,
		}
		states[player] = s
	end
	return s
end

local function playSound(parent: Instance, id: string, volume: number, pitch: number)
	local snd = Instance.new("Sound")
	snd.SoundId = id
	snd.Volume = volume
	snd.PlaybackSpeed = pitch
	snd.Parent = parent
	snd:Play()
	Debris:AddItem(snd, 3)
end

local function updateAttributes(player: Player, s)
	player:SetAttribute("HasEgg", s.egg ~= nil)
	player:SetAttribute("Carrying", s.carrying)
	player:SetAttribute("EggHealth", math.ceil(s.health))
	player:SetAttribute("EggWobble", math.floor(s.wobble))
end

-- Fissures visibles : de petites lignes sombres collées à la coquille
local function updateCracks(s)
	local egg = s.egg
	if not egg then
		return
	end
	local wanted = 0
	if s.health < 100 then wanted = 2 end
	if s.health < 70 then wanted = 5 end
	if s.health < 35 then wanted = 9 end
	local cracks = egg:FindFirstChild("Cracks")
	local current = #cracks:GetChildren()
	local rng = Random.new()
	for _ = current + 1, wanted do
		local dir = rng:NextUnitVector()
		local r = Config.EGG_SIZE / 2
		local pos = Vector3.new(dir.X * r, dir.Y * r * 1.3, dir.Z * r) * 0.97
		local crack = Instance.new("Part")
		crack.Name = "Crack"
		crack.Size = Vector3.new(0.07, rng:NextNumber(0.35, 0.7), 0.05)
		crack.Color = Color3.fromRGB(70, 55, 40)
		crack.Material = Enum.Material.SmoothPlastic
		crack.CanCollide = false
		crack.CanQuery = false
		crack.CanTouch = false
		crack.Massless = true
		crack.CFrame = egg.CFrame * CFrame.lookAt(pos, pos * 2) * CFrame.Angles(0, 0, rng:NextNumber(-1, 1))
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = egg
		weld.Part1 = crack
		weld.Parent = crack
		crack.Parent = cracks
	end
	-- La coquille jaunit un peu avec les dégâts
	local t = 1 - s.health / Config.EGG_MAX_HEALTH
	egg.Color = Color3.fromRGB(252, 248, 236):Lerp(Color3.fromRGB(230, 205, 160), t)
end

local function makeEgg(player: Player): BasePart
	local egg = Instance.new("Part")
	egg.Name = "Egg_" .. player.Name
	egg.Shape = Enum.PartType.Ball
	egg.Size = Vector3.new(Config.EGG_SIZE, Config.EGG_SIZE, Config.EGG_SIZE)
	egg.Color = Color3.fromRGB(252, 248, 236)
	egg.Material = Enum.Material.SmoothPlastic
	egg.CustomPhysicalProperties = PhysicalProperties.new(0.8, 0.6, 0.25, 1, 1) -- léger rebond
	egg:SetAttribute("Owner", player.UserId)
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(1, 1.3, 1)
	mesh.Parent = egg
	local cracks = Instance.new("Folder")
	cracks.Name = "Cracks"
	cracks.Parent = egg
	local shine = Instance.new("PointLight")
	shine.Brightness = 0.4
	shine.Range = 5
	shine.Color = Color3.fromRGB(255, 240, 200)
	shine.Parent = egg
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "PickupPrompt"
	prompt.ActionText = "Ramasser l'œuf"
	prompt.ObjectText = "Ton œuf"
	prompt.HoldDuration = 0.3
	prompt.MaxActivationDistance = 9
	prompt.RequiresLineOfSight = false
	prompt.Enabled = false
	prompt.Parent = egg
	prompt.Triggered:Connect(function(who)
		if who == player then
			EggSystem.attach(player)
		end
	end)
	return egg
end

function EggSystem.attach(player: Player): boolean
	local s = getState(player)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not s.egg or not root or not hum or hum.Health <= 0 then
		return false
	end
	if s.carrying then
		return true
	end
	if (s.egg.Position - root.Position).Magnitude > 14 then
		return false -- anti-triche : il faut être à côté de l'œuf
	end
	local egg = s.egg
	egg.Anchored = false
	egg.CanCollide = false
	egg.Massless = true
	egg.AssemblyLinearVelocity = Vector3.zero
	egg.CFrame = root.CFrame * Config.EGG_CARRY_OFFSET
	local weld = Instance.new("Weld")
	weld.Name = "EggWeld"
	weld.Part0 = root
	weld.Part1 = egg
	weld.C0 = Config.EGG_CARRY_OFFSET
	weld.Parent = root
	egg.PickupPrompt.Enabled = false
	s.carrying = true
	s.wobble = 0
	s.lastVy = root.AssemblyLinearVelocity.Y
	s.lastHv = Vector3.zero
	updateAttributes(player, s)
	return true
end

function EggSystem.giveEgg(player: Player, health: number?)
	local s = getState(player)
	if s.egg then
		s.egg:Destroy()
	end
	s.health = health or Config.EGG_MAX_HEALTH
	s.wobble = 0
	s.carrying = false
	local egg = makeEgg(player)
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if root then
		egg.CFrame = root.CFrame * Config.EGG_CARRY_OFFSET
	end
	egg.Parent = eggFolder
	s.egg = egg
	updateCracks(s)
	EggSystem.attach(player)
	updateAttributes(player, s)
end

-- L'œuf quitte les mains : il devient un objet physique géré par le serveur
function EggSystem.drop(player: Player, gentle: boolean?)
	local s = getState(player)
	if not s.egg or not s.carrying then
		return
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	local weld = root and root:FindFirstChild("EggWeld")
	if weld then
		weld:Destroy()
	end
	local egg = s.egg
	egg.Massless = false
	egg.CanCollide = true
	s.carrying = false
	s.wobble = 0
	if root then
		if gentle then
			egg.CFrame = root.CFrame * CFrame.new(0, -1.5, -2.5)
			egg.AssemblyLinearVelocity = Vector3.zero
		else
			local push = root.AssemblyLinearVelocity + root.CFrame.LookVector * 8 + Vector3.new(0, 6, 0)
			egg.AssemblyLinearVelocity = push
		end
	end
	pcall(function()
		egg:SetNetworkOwner(nil)
	end)
	s.lastLooseVy = egg.AssemblyLinearVelocity.Y
	egg.PickupPrompt.Enabled = true
	if not gentle then
		playSound(egg, SOUND_DROP, 0.8, 1.3)
	end
	updateAttributes(player, s)
end

function EggSystem.damage(player: Player, amount: number, reason: string?)
	local s = getState(player)
	if not s.egg or amount <= 0 then
		return
	end
	s.health = math.max(0, s.health - amount)
	updateCracks(s)
	playSound(s.egg, SOUND_HIT, 0.7, 1.6 + math.random() * 0.4)
	updateAttributes(player, s)
	if s.health <= 0 then
		EggSystem.breakEgg(player, reason or "impact")
	elseif amount >= 12 then
		notify(player, "Aïe ! L'œuf est " .. string.lower(Config.eggStateName(s.health)) .. " (" .. math.ceil(s.health) .. " %)", "bad")
	end
end

-- Coup reçu d'un obstacle (rondin, bras rotatif…) avec un délai anti-spam par obstacle
function EggSystem.hit(player: Player, source: Instance, damage: number, wobble: number)
	local s = getState(player)
	if not s.egg or not s.carrying then
		return
	end
	local now = os.clock()
	if s.cooldowns[source] and now - s.cooldowns[source] < 0.8 then
		return
	end
	s.cooldowns[source] = now
	s.wobble += wobble
	EggSystem.damage(player, damage, "obstacle")
end

function EggSystem.addWobble(player: Player, amount: number)
	local s = getState(player)
	if s.carrying then
		s.wobble += amount
	end
end

function EggSystem.breakEgg(player: Player, reason: string)
	local s = getState(player)
	local egg = s.egg
	if not egg then
		return
	end
	local pos = egg.Position
	-- Effet : éclats de coquille + jaune d'œuf
	local fx = Instance.new("Part")
	fx.Anchored = true
	fx.CanCollide = false
	fx.CanQuery = false
	fx.Transparency = 1
	fx.Size = Vector3.one
	fx.Position = pos
	fx.Parent = workspace
	local shards = Instance.new("ParticleEmitter")
	shards.Color = ColorSequence.new(Color3.fromRGB(250, 245, 230))
	shards.Size = NumberSequence.new(0.35, 0.1)
	shards.Speed = NumberRange.new(12, 22)
	shards.SpreadAngle = Vector2.new(180, 180)
	shards.Lifetime = NumberRange.new(0.5, 0.9)
	shards.Acceleration = Vector3.new(0, -60, 0)
	shards.Rate = 0
	shards.Parent = fx
	local yolk = shards:Clone()
	yolk.Color = ColorSequence.new(Color3.fromRGB(255, 190, 20))
	yolk.Size = NumberSequence.new(0.5, 0.2)
	yolk.Speed = NumberRange.new(6, 12)
	yolk.Parent = fx
	shards:Emit(35)
	yolk:Emit(25)
	playSound(fx, SOUND_HIT, 1, 0.6)
	Debris:AddItem(fx, 2)
	-- Flaque de jaune sur le sol
	local params = RaycastParams.new()
	params.FilterDescendantsInstances = { eggFolder, player.Character }
	params.FilterType = Enum.RaycastFilterType.Exclude
	local hit = workspace:Raycast(pos, Vector3.new(0, -12, 0), params)
	if hit then
		local splat = Instance.new("Part")
		splat.Shape = Enum.PartType.Cylinder
		splat.Size = Vector3.new(0.1, 3.2, 3.2)
		splat.Color = Color3.fromRGB(255, 196, 30)
		splat.Material = Enum.Material.Glass
		splat.Anchored = true
		splat.CanCollide = false
		splat.CanQuery = false
		splat.CFrame = CFrame.new(hit.Position + hit.Normal * 0.06, hit.Position + hit.Normal) * CFrame.Angles(0, math.rad(90), 0)
		splat.Parent = workspace
		Debris:AddItem(splat, 8)
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	local weld = root and root:FindFirstChild("EggWeld")
	if weld then
		weld:Destroy()
	end
	egg:Destroy()
	s.egg = nil
	s.carrying = false
	s.health = 0
	s.wobble = 0
	updateAttributes(player, s)
	notify(player, "CRAC ! Ton œuf est cassé…", "bad")
	if EggSystem.onBroken then
		task.spawn(EggSystem.onBroken, player, reason)
	end
end

-- Retire l'œuf sans le casser (livraison à Gérard). Renvoie sa santé.
function EggSystem.takeEgg(player: Player): number
	local s = getState(player)
	local health = s.health
	if s.egg then
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		local weld = root and root:FindFirstChild("EggWeld")
		if weld then
			weld:Destroy()
		end
		s.egg:Destroy()
	end
	s.egg = nil
	s.carrying = false
	s.wobble = 0
	updateAttributes(player, s)
	return health
end

function EggSystem.getInfo(player: Player)
	local s = getState(player)
	return { hasEgg = s.egg ~= nil, carrying = s.carrying, health = s.health, egg = s.egg }
end

function EggSystem.setWindZones(list: { BasePart })
	windZones = list
end

local function inZone(part: BasePart, pos: Vector3): boolean
	local p = part.CFrame:PointToObjectSpace(pos)
	local h = part.Size / 2
	return math.abs(p.X) <= h.X and math.abs(p.Y) <= h.Y and math.abs(p.Z) <= h.Z
end

-- Boucle physique principale (serveur)
RunService.Heartbeat:Connect(function(dt)
	for player, s in pairs(states) do
		local egg = s.egg
		if egg and egg.Parent then
			if s.carrying then
				local char = player.Character
				local root = char and char:FindFirstChild("HumanoidRootPart")
				if root then
					local v = root.AssemblyLinearVelocity
					local hv = Vector3.new(v.X, 0, v.Z)
					-- Atterrissage brutal
					if s.lastVy <= -Config.CARRY_IMPACT_THRESHOLD and v.Y - s.lastVy > Config.CARRY_IMPACT_THRESHOLD * 0.6 then
						local impact = -s.lastVy
						EggSystem.damage(player, (impact - Config.CARRY_IMPACT_THRESHOLD) * Config.CARRY_IMPACT_DAMAGE, "chute")
						s.wobble += (impact - Config.CARRY_IMPACT_THRESHOLD) * 0.8
					end
					-- Saut
					if v.Y > 30 and s.lastVy < 5 then
						s.wobble += Config.WOBBLE_JUMP
					end
					-- Changements brusques de direction ou de vitesse
					local dv = (hv - s.lastHv).Magnitude
					if dv > Config.WOBBLE_SPEED_CHANGE_MIN then
						s.wobble += (dv - Config.WOBBLE_SPEED_CHANGE_MIN) * Config.WOBBLE_PER_SPEED_CHANGE
					end
					-- Vent
					for _, zone in ipairs(windZones) do
						if zone.Parent and inZone(zone, root.Position) then
							s.wobble += Config.WOBBLE_WIND_PER_SEC * dt
						end
					end
					s.lastVy = v.Y
					s.lastHv = hv
					s.wobble = math.max(0, s.wobble - Config.WOBBLE_DECAY * dt)
					if s.egg and s.carrying and s.wobble >= Config.WOBBLE_DROP_AT then
						EggSystem.drop(player, false)
						notify(player, "Oups ! L'œuf t'a glissé des mains ! Va vite le ramasser.", "bad")
					end
				end
			else
				-- Œuf libre : il peut rouler, rebondir… et se casser
				local vy = egg.AssemblyLinearVelocity.Y
				if s.lastLooseVy <= -Config.LOOSE_IMPACT_THRESHOLD and vy - s.lastLooseVy > Config.LOOSE_IMPACT_THRESHOLD * 0.6 then
					EggSystem.damage(player, (-s.lastLooseVy - Config.LOOSE_IMPACT_THRESHOLD) * Config.LOOSE_IMPACT_DAMAGE, "chute")
				end
				s.lastLooseVy = vy
				if s.egg and s.egg.Position.Y < -18 then
					EggSystem.breakEgg(player, "vide")
				end
			end
			s.attrTimer += dt
			if s.attrTimer > 0.1 then
				s.attrTimer = 0
				player:SetAttribute("EggWobble", math.floor(s.wobble))
			end
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	local s = states[player]
	if s and s.egg then
		s.egg:Destroy()
	end
	states[player] = nil
end)

return EggSystem
]=])
add("ModuleScript", "ObstacleSystem", server, [=[
-- EGG MOUNTAIN — ObstacleSystem : planches fragiles, bras rotatifs, rondins, vide et vent.
-- Les obstacles sont repérés par des attributs posés par le script de construction de la map.

local Players = game:GetService("Players")
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("EggMountain"):WaitForChild("Config"))

local ObstacleSystem = {}

local function playerFromHit(hit: BasePart): Player?
	local model = hit:FindFirstAncestorOfClass("Model")
	if not model then
		return nil
	end
	local player = Players:GetPlayerFromCharacter(model)
	if player then
		local hum = model:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			return player
		end
	end
	return nil
end

-- Planche fragile : tremble, tombe, puis revient
local function setupFragile(plank: BasePart)
	local home = plank.CFrame
	local baseColor = plank.Color
	local busy = false
	plank.Touched:Connect(function(hit)
		if busy or not playerFromHit(hit) then
			return
		end
		busy = true
		plank.Color = Color3.fromRGB(200, 120, 60)
		for i = 1, 5 do
			plank.CFrame = home * CFrame.new(0, 0, (i % 2 == 0) and 0.12 or -0.12)
			task.wait(0.08)
		end
		plank.CFrame = home
		plank.Anchored = false
		plank.CanCollide = false
		task.wait(1.2)
		plank.Anchored = true
		plank.Transparency = 1
		plank.CFrame = home
		task.wait(3)
		plank.Color = baseColor
		plank.CanCollide = true
		TweenService:Create(plank, TweenInfo.new(0.4), { Transparency = 0 }):Play()
		task.wait(0.4)
		busy = false
	end)
end

-- Bras rotatif : la charnière motorisée est créée par le script de la map
local function setupSweeper(arm: BasePart)
	pcall(function()
		arm:SetNetworkOwner(nil)
	end)
	arm.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if player and ObstacleSystem.EggSystem then
			ObstacleSystem.EggSystem.hit(player, arm, Config.SWEEPER_DAMAGE, Config.SWEEPER_WOBBLE)
		end
	end)
end

-- Générateur de rondins qui dévalent la pente
local function setupLogSpawner(spawner: BasePart, folder: Instance)
	local interval = spawner:GetAttribute("Interval") or 3.5
	task.spawn(function()
		while spawner.Parent do
			local log = Instance.new("Part")
			log.Name = "RollingLog"
			log.Shape = Enum.PartType.Cylinder
			log.Size = Vector3.new(11, 4, 4)
			log.Color = Color3.fromRGB(110, 72, 40)
			log.Material = Enum.Material.Wood
			log.CFrame = spawner.CFrame * CFrame.new(math.random(-20, 20) / 10, 0, 0)
			log.CustomPhysicalProperties = PhysicalProperties.new(1.2, 0.5, 0.1)
			log.Parent = folder
			pcall(function()
				log:SetNetworkOwner(nil)
			end)
			log.AssemblyLinearVelocity = spawner.CFrame.LookVector * 10
			log.Touched:Connect(function(hit)
				local player = playerFromHit(hit)
				if player and ObstacleSystem.EggSystem then
					ObstacleSystem.EggSystem.hit(player, log, Config.LOG_DAMAGE, Config.LOG_WOBBLE)
				end
			end)
			Debris:AddItem(log, 12)
			task.wait(interval + math.random() * 1.5)
		end
	end)
end

-- Zone de vide : le joueur tombe, l'œuf est perdu
local function setupKillZone(zone: BasePart)
	zone.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if player then
			local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
			if hum then
				hum.Health = 0
			end
		end
	end)
end

function ObstacleSystem.init(map: Instance, EggSystem)
	ObstacleSystem.EggSystem = EggSystem
	local logsFolder = Instance.new("Folder")
	logsFolder.Name = "RollingLogs"
	logsFolder.Parent = workspace
	local wind = {}
	for _, d in ipairs(map:GetDescendants()) do
		if d:IsA("BasePart") then
			if d:GetAttribute("Fragile") then
				setupFragile(d)
			elseif d:GetAttribute("Sweeper") then
				setupSweeper(d)
			elseif d:GetAttribute("LogSpawner") then
				setupLogSpawner(d, logsFolder)
			elseif d:GetAttribute("KillZone") then
				setupKillZone(d)
			elseif d:GetAttribute("LogKill") then
				d.Touched:Connect(function(hit)
					if hit.Name == "RollingLog" then
						hit:Destroy()
					end
				end)
			elseif d:GetAttribute("Wind") then
				table.insert(wind, d)
			end
		end
	end
	EggSystem.setWindZones(wind)
end

return ObstacleSystem
]=])
add("Script", "Main", server, [=[
-- EGG MOUNTAIN — Script principal du serveur (phase 1 : prototype jouable)
-- Ascension : prendre l'œuf au camp -> checkpoints -> livrer l'œuf à Gérard au sommet.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local shared = ReplicatedStorage:WaitForChild("EggMountain")
local Config = require(shared:WaitForChild("Config"))
local DataManager = require(script.Parent:WaitForChild("DataManager"))
local EggSystem = require(script.Parent:WaitForChild("EggSystem"))
local ObstacleSystem = require(script.Parent:WaitForChild("ObstacleSystem"))

local remotes = shared:WaitForChild("Remotes")
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent
local EggAction = remotes:WaitForChild("EggAction") :: RemoteEvent
local IntroDone = remotes:WaitForChild("IntroDone") :: RemoteEvent

local map = workspace:WaitForChild("EggMountain")
local camp = map:WaitForChild("Camp")
local sommet = map:WaitForChild("Sommet")
local checkpointsFolder = map:WaitForChild("Checkpoints")

Players.RespawnTime = Config.RESPAWN_DELAY

local function notify(player: Player, text: string, kind: string?)
	Notify:FireClient(player, text, kind or "info")
end
EggSystem.notify = notify

-- Checkpoints triés par numéro
local checkpoints: { [number]: BasePart } = {}
for _, cp in ipairs(checkpointsFolder:GetChildren()) do
	local index = cp:GetAttribute("Index")
	if cp:IsA("BasePart") and index then
		checkpoints[index] = cp
	end
end
local CHECKPOINT_COUNT = #checkpoints

local campSpawn = camp:WaitForChild("CampSpawn") :: BasePart

local function spawnCFrame(index: number): CFrame
	local cp = checkpoints[index]
	if cp then
		return cp.CFrame * CFrame.new(0, 4, 0)
	end
	return campSpawn.CFrame * CFrame.new(0, 4, 0)
end

local function serverTime(): number
	return workspace:GetServerTimeNow()
end

-- Économie et XP (toujours côté serveur)
local function refreshStats(player: Player)
	local data = DataManager.get(player)
	if not data then
		return
	end
	player:SetAttribute("Coins", data.coins)
	player:SetAttribute("Level", data.level)
	player:SetAttribute("XP", data.xp)
	player:SetAttribute("XPNext", Config.xpForLevel(data.level))
	player:SetAttribute("Checkpoint", data.checkpoint)
	player:SetAttribute("CheckpointTotal", CHECKPOINT_COUNT)
	player:SetAttribute("Delivered", data.delivered)
	player:SetAttribute("BestTime", data.bestTime)
	local ls = player:FindFirstChild("leaderstats")
	if ls then
		ls.Coins.Value = data.coins
		ls.Niveau.Value = data.level
	end
end

local function addCoins(player: Player, amount: number)
	local data = DataManager.get(player)
	if data then
		data.coins += amount
	end
end

local function addXP(player: Player, amount: number)
	local data = DataManager.get(player)
	if not data then
		return
	end
	data.xp += amount
	while data.level < Config.MAX_LEVEL and data.xp >= Config.xpForLevel(data.level) do
		data.xp -= Config.xpForLevel(data.level)
		data.level += 1
		notify(player, "NIVEAU " .. data.level .. " !", "big")
	end
end

local function startRun(player: Player)
	local data = DataManager.get(player)
	if not data then
		return
	end
	data.runActive = true
	data.checkpoint = 0
	player:SetAttribute("RunStart", serverTime())
	EggSystem.giveEgg(player)
	refreshStats(player)
	notify(player, "Mission : apporte cet œuf à Gérard, au sommet. NE LE CASSE SURTOUT PAS !", "big")
end

local function endRun(player: Player)
	local data = DataManager.get(player)
	if data then
		data.runActive = false
		data.checkpoint = 0
	end
	player:SetAttribute("RunStart", 0)
	refreshStats(player)
end

-- Après une casse
EggSystem.onBroken = function(player: Player, _reason: string)
	local data = DataManager.get(player)
	if not data then
		return
	end
	if Config.BREAK_SENDS_TO_CAMP then
		endRun(player)
	end
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum and hum.Health > 0 then
		task.wait(Config.RESPAWN_DELAY)
		if player.Parent and player.Character and data.runActive then
			player.Character:PivotTo(spawnCFrame(data.checkpoint))
			EggSystem.giveEgg(player)
			notify(player, "Nouvel œuf ! Reprends depuis le checkpoint " .. data.checkpoint .. ".", "info")
		elseif player.Parent and player.Character then
			player.Character:PivotTo(spawnCFrame(0))
		end
	end
	-- Si le joueur est mort (chute dans le vide), CharacterAdded s'en occupe
end

local function onCharacter(player: Player, char: Model)
	local hum = char:WaitForChild("Humanoid") :: Humanoid
	char:WaitForChild("HumanoidRootPart")
	task.wait(0.1)
	local data = DataManager.get(player)
	if data and data.runActive then
		char:PivotTo(spawnCFrame(data.checkpoint))
		task.wait(0.2)
		EggSystem.giveEgg(player)
	else
		char:PivotTo(spawnCFrame(0))
	end
	hum.Died:Connect(function()
		if EggSystem.getInfo(player).hasEgg then
			EggSystem.breakEgg(player, "chute")
		end
	end)
end

local function onPlayerAdded(player: Player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Parent = ls
	local lvl = Instance.new("IntValue")
	lvl.Name = "Niveau"
	lvl.Parent = ls
	ls.Parent = player

	local data = DataManager.load(player)
	if not player.Parent then
		return
	end
	player:SetAttribute("IntroSeen", data.introSeen)
	player:SetAttribute("RunStart", data.runActive and serverTime() or 0)
	refreshStats(player)

	player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end)
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	DataManager.release(player)
end)

-- Prendre un œuf au camp
local pedestal = camp:WaitForChild("EggPedestal") :: BasePart
local takePrompt = Instance.new("ProximityPrompt")
takePrompt.ActionText = "Prendre un œuf"
takePrompt.ObjectText = "Œuf de Gérard"
takePrompt.HoldDuration = 0.5
takePrompt.MaxActivationDistance = 10
takePrompt.RequiresLineOfSight = false
takePrompt.Parent = pedestal
takePrompt.Triggered:Connect(function(player)
	local info = EggSystem.getInfo(player)
	if info.hasEgg then
		notify(player, "Tu as déjà un œuf ! Monte jusqu'au sommet.", "info")
		return
	end
	startRun(player)
end)

-- Checkpoints : validés seulement en portant l'œuf, dans l'ordre
for index, cp in pairs(checkpoints) do
	cp.Touched:Connect(function(hit)
		local char = hit:FindFirstAncestorOfClass("Model")
		local player = char and Players:GetPlayerFromCharacter(char)
		if not player then
			return
		end
		local data = DataManager.get(player)
		if not data or not data.runActive or index ~= data.checkpoint + 1 then
			return
		end
		if not EggSystem.getInfo(player).carrying then
			notify(player, "Il faut porter ton œuf pour valider le checkpoint !", "info")
			return
		end
		data.checkpoint = index
		addCoins(player, Config.COINS_CHECKPOINT)
		addXP(player, Config.XP_CHECKPOINT)
		refreshStats(player)
		notify(player, "Checkpoint " .. index .. "/" .. CHECKPOINT_COUNT .. " ! +" .. Config.COINS_CHECKPOINT .. " EGG COINS", "good")
	end)
end

-- Livraison à Gérard
local deliveryTable = sommet:WaitForChild("DeliveryTable") :: BasePart
local deliverPrompt = Instance.new("ProximityPrompt")
deliverPrompt.ActionText = "Livrer l'œuf à Gérard"
deliverPrompt.ObjectText = "Table de Gérard"
deliverPrompt.HoldDuration = 1
deliverPrompt.MaxActivationDistance = 12
deliverPrompt.RequiresLineOfSight = false
deliverPrompt.Parent = deliveryTable

local function formatTime(seconds: number): string
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

deliverPrompt.Triggered:Connect(function(player)
	local data = DataManager.get(player)
	local info = EggSystem.getInfo(player)
	if not data or not data.runActive or not info.carrying then
		notify(player, "Gérard : « Où est mon œuf ?! Reviens avec un œuf dans les mains ! »", "info")
		return
	end
	if data.checkpoint < CHECKPOINT_COUNT then
		notify(player, "Gérard : « Tu as pris un raccourci, toi… Passe par tous les checkpoints ! »", "bad")
		return
	end
	local health = EggSystem.takeEgg(player)
	local runStart = player:GetAttribute("RunStart") or serverTime()
	local elapsed = math.max(0, math.floor(serverTime() - runStart))
	local coins = Config.COINS_DELIVERY
	local perfect = health >= Config.EGG_MAX_HEALTH
	if perfect then
		coins += Config.COINS_PERFECT_BONUS
		data.perfectDeliveries += 1
	end
	data.delivered += 1
	local record = data.bestTime == 0 or elapsed < data.bestTime
	if record then
		data.bestTime = elapsed
	end
	addCoins(player, coins)
	addXP(player, Config.XP_DELIVERY)
	endRun(player)

	-- L'œuf est posé sur la table quelques secondes
	local shown = Instance.new("Part")
	shown.Shape = Enum.PartType.Ball
	shown.Size = Vector3.new(Config.EGG_SIZE, Config.EGG_SIZE, Config.EGG_SIZE)
	shown.Color = Color3.fromRGB(252, 248, 236)
	shown.Anchored = true
	shown.CanCollide = false
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(1, 1.3, 1)
	mesh.Parent = shown
	shown.CFrame = deliveryTable.CFrame * CFrame.new(math.random(-15, 15) / 10, deliveryTable.Size.Y / 2 + 1.2, 0)
	shown.Parent = workspace
	game:GetService("Debris"):AddItem(shown, 8)

	if perfect then
		notify(player, "Gérard : « ENFIN ! Un œuf PARFAIT ! Je vais faire la meilleure omelette de l'histoire ! »", "big")
	else
		notify(player, "Gérard : « Il est un peu fissuré… (" .. math.ceil(health) .. " %) Mais ça ira pour une omelette ! »", "big")
	end
	notify(player, "+" .. coins .. " EGG COINS  •  Temps : " .. formatTime(elapsed) .. (record and "  •  NOUVEAU RECORD !" or ""), "good")
	notify(player, "(La cuisine de l'omelette arrive en phase 11. Retour au camp…)", "info")
	task.delay(7, function()
		if player.Parent and player.Character then
			player.Character:PivotTo(spawnCFrame(0))
		end
	end)
end)

-- Actions du client (validées par le serveur)
local lastAction: { [Player]: number } = {}
EggAction.OnServerEvent:Connect(function(player, action)
	local now = os.clock()
	if lastAction[player] and now - lastAction[player] < 0.4 then
		return
	end
	lastAction[player] = now
	if action == "drop" then
		local info = EggSystem.getInfo(player)
		if info.carrying then
			EggSystem.drop(player, true)
			notify(player, "Tu as posé ton œuf. Appuie sur E à côté pour le reprendre.", "info")
		end
	end
end)

IntroDone.OnServerEvent:Connect(function(player)
	local data = DataManager.get(player)
	if data and not data.introSeen then
		data.introSeen = true
		player:SetAttribute("IntroSeen", true)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	lastAction[player] = nil
end)

ObstacleSystem.init(map, EggSystem)
print("[EggMountain] Serveur prêt — version " .. Config.VERSION .. " — " .. CHECKPOINT_COUNT .. " checkpoints")
]=])
add("LocalScript", "EggMountainClient", client, [=[
-- EGG MOUNTAIN — Client : HUD, notifications, oscillation de l'œuf, cinématique d'intro.
-- Le client n'attribue jamais rien : il affiche les attributs envoyés par le serveur.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local ContextActionService = game:GetService("ContextActionService")

local player = Players.LocalPlayer
local shared = ReplicatedStorage:WaitForChild("EggMountain")
local Config = require(shared:WaitForChild("Config"))
local remotes = shared:WaitForChild("Remotes")
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent
local EggAction = remotes:WaitForChild("EggAction") :: RemoteEvent
local IntroDone = remotes:WaitForChild("IntroDone") :: RemoteEvent

local FONT = Enum.Font.FredokaOne
local CREAM = Color3.fromRGB(255, 248, 230)
local DARK = Color3.fromRGB(35, 30, 45)

------------------------------------------------------------------ helpers UI
local function make(className: string, props: { [string]: any }, children: { Instance }?)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	if children then
		for _, c in ipairs(children) do
			c.Parent = inst
		end
	end
	inst.Parent = props.Parent
	return inst
end

local function corner(r: number)
	return make("UICorner", { CornerRadius = UDim.new(0, r) })
end

local function stroke(color: Color3, t: number)
	return make("UIStroke", { Color = color, Thickness = t, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
end

local function label(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or FONT
	props.TextColor3 = props.TextColor3 or CREAM
	props.TextScaled = true
	return make("TextLabel", props)
end

local function bar(parent: Instance, pos: UDim2, size: UDim2, color: Color3)
	local back = make("Frame", {
		Parent = parent, Position = pos, Size = size,
		BackgroundColor3 = Color3.fromRGB(20, 18, 28), BackgroundTransparency = 0.2,
	}, { corner(8) })
	local fill = make("Frame", {
		Parent = back, Size = UDim2.fromScale(1, 1), BackgroundColor3 = color,
	}, { corner(8) })
	return back, fill
end

------------------------------------------------------------------ HUD
local gui = make("ScreenGui", {
	Name = "EggMountainHUD", ResetOnSpawn = false, IgnoreGuiInset = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling, Parent = player:WaitForChild("PlayerGui"),
})

-- Panneau en haut à gauche : coins, niveau, XP
local stats = make("Frame", {
	Parent = gui, Position = UDim2.new(0, 12, 0, 12), Size = UDim2.new(0, 230, 0, 92),
	BackgroundColor3 = DARK, BackgroundTransparency = 0.25,
}, { corner(14), stroke(Color3.fromRGB(255, 210, 90), 2) })
local coinsLabel = label({ Parent = stats, Position = UDim2.new(0, 12, 0, 8), Size = UDim2.new(1, -24, 0, 30),
	Text = "🥚 0 EGG COINS", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 215, 90) })
local levelLabel = label({ Parent = stats, Position = UDim2.new(0, 12, 0, 40), Size = UDim2.new(1, -24, 0, 20),
	Text = "Niveau 1", TextXAlignment = Enum.TextXAlignment.Left })
local _, xpFill = bar(stats, UDim2.new(0, 12, 0, 66), UDim2.new(1, -24, 0, 12), Color3.fromRGB(120, 200, 255))

-- Panneau en haut à droite : altitude, checkpoint, chrono
local runPanel = make("Frame", {
	Parent = gui, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -12, 0, 12),
	Size = UDim2.new(0, 200, 0, 92), BackgroundColor3 = DARK, BackgroundTransparency = 0.25,
}, { corner(14) })
local altLabel = label({ Parent = runPanel, Position = UDim2.new(0, 12, 0, 8), Size = UDim2.new(1, -24, 0, 24),
	Text = "⛰️ Altitude : 0 m", TextXAlignment = Enum.TextXAlignment.Left })
local cpLabel = label({ Parent = runPanel, Position = UDim2.new(0, 12, 0, 36), Size = UDim2.new(1, -24, 0, 22),
	Text = "🚩 Checkpoint 0/0", TextXAlignment = Enum.TextXAlignment.Left })
local timeLabel = label({ Parent = runPanel, Position = UDim2.new(0, 12, 0, 62), Size = UDim2.new(1, -24, 0, 22),
	Text = "⏱️ --:--", TextXAlignment = Enum.TextXAlignment.Left })

-- Panneau de l'œuf, en bas au centre
local eggPanel = make("Frame", {
	Parent = gui, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -18),
	Size = UDim2.new(0, 320, 0, 96), BackgroundColor3 = DARK, BackgroundTransparency = 0.2, Visible = false,
}, { corner(16), stroke(CREAM, 2) })
local eggState = label({ Parent = eggPanel, Position = UDim2.new(0, 14, 0, 6), Size = UDim2.new(1, -28, 0, 26),
	Text = "🥚 Intact — 100 %" })
label({ Parent = eggPanel, Position = UDim2.new(0, 14, 0, 36), Size = UDim2.new(0, 80, 0, 18),
	Text = "Solidité", TextXAlignment = Enum.TextXAlignment.Left })
local _, healthFill = bar(eggPanel, UDim2.new(0, 100, 0, 38), UDim2.new(1, -114, 0, 14), Color3.fromRGB(110, 220, 120))
label({ Parent = eggPanel, Position = UDim2.new(0, 14, 0, 62), Size = UDim2.new(0, 80, 0, 18),
	Text = "Équilibre", TextXAlignment = Enum.TextXAlignment.Left })
local _, wobbleFill = bar(eggPanel, UDim2.new(0, 100, 0, 64), UDim2.new(1, -114, 0, 14), Color3.fromRGB(120, 190, 255))
local looseHint = label({ Parent = gui, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -122),
	Size = UDim2.new(0, 420, 0, 26), Text = "⚠️ Ton œuf est par terre ! Va le ramasser (E)", Visible = false,
	TextColor3 = Color3.fromRGB(255, 170, 90), TextStrokeTransparency = 0.4 })

-- Notifications
local notifHolder = make("Frame", {
	Parent = gui, AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 120),
	Size = UDim2.new(0, 560, 0, 300), BackgroundTransparency = 1,
}, { make("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center }) })

local KIND_COLORS = {
	info = Color3.fromRGB(60, 55, 80),
	good = Color3.fromRGB(40, 140, 80),
	bad = Color3.fromRGB(170, 60, 50),
	big = Color3.fromRGB(200, 140, 30),
}

local function showNotification(text: string, kind: string)
	local big = kind == "big"
	local frame = make("Frame", {
		Parent = notifHolder, Size = UDim2.new(1, 0, 0, big and 54 or 38),
		BackgroundColor3 = KIND_COLORS[kind] or KIND_COLORS.info, BackgroundTransparency = 1,
	}, { corner(12) })
	local txt = label({ Parent = frame, Position = UDim2.new(0, 12, 0, 4), Size = UDim2.new(1, -24, 1, -8),
		Text = text, TextTransparency = 1, TextWrapped = true })
	TweenService:Create(frame, TweenInfo.new(0.25), { BackgroundTransparency = 0.1 }):Play()
	TweenService:Create(txt, TweenInfo.new(0.25), { TextTransparency = 0 }):Play()
	task.delay(big and 6 or 4, function()
		TweenService:Create(frame, TweenInfo.new(0.4), { BackgroundTransparency = 1 }):Play()
		TweenService:Create(txt, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
		task.wait(0.45)
		frame:Destroy()
	end)
end
Notify.OnClientEvent:Connect(showNotification)

------------------------------------------------------------------ mise à jour HUD
local function formatTime(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

local function refreshStats()
	coinsLabel.Text = "🥚 " .. (player:GetAttribute("Coins") or 0) .. " EGG COINS"
	local lvl = player:GetAttribute("Level") or 1
	levelLabel.Text = "Niveau " .. lvl
	local xp = player:GetAttribute("XP") or 0
	local nextXp = player:GetAttribute("XPNext") or 100
	TweenService:Create(xpFill, TweenInfo.new(0.3), { Size = UDim2.fromScale(math.clamp(xp / nextXp, 0, 1), 1) }):Play()
	cpLabel.Text = "🚩 Checkpoint " .. (player:GetAttribute("Checkpoint") or 0) .. "/" .. (player:GetAttribute("CheckpointTotal") or 0)
end
for _, name in ipairs({ "Coins", "Level", "XP", "XPNext", "Checkpoint", "CheckpointTotal" }) do
	player:GetAttributeChangedSignal(name):Connect(refreshStats)
end
refreshStats()

RunService.RenderStepped:Connect(function()
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root then
		altLabel.Text = "⛰️ Altitude : " .. math.max(0, math.floor(root.Position.Y)) .. " m"
	end
	local runStart = player:GetAttribute("RunStart") or 0
	if runStart > 0 then
		timeLabel.Text = "⏱️ " .. formatTime(workspace:GetServerTimeNow() - runStart)
	else
		local best = player:GetAttribute("BestTime") or 0
		timeLabel.Text = best > 0 and ("🏆 Record : " .. formatTime(best)) or "⏱️ --:--"
	end
	local hasEgg = player:GetAttribute("HasEgg") == true
	eggPanel.Visible = hasEgg
	looseHint.Visible = hasEgg and player:GetAttribute("Carrying") ~= true
	if hasEgg then
		local health = player:GetAttribute("EggHealth") or 100
		local wobble = player:GetAttribute("EggWobble") or 0
		eggState.Text = "🥚 " .. Config.eggStateName(health) .. " — " .. health .. " %"
		healthFill.Size = UDim2.fromScale(math.clamp(health / Config.EGG_MAX_HEALTH, 0, 1), 1)
		healthFill.BackgroundColor3 = Color3.fromRGB(230, 70, 60):Lerp(Color3.fromRGB(110, 220, 120), health / 100)
		local w = math.clamp(wobble / Config.WOBBLE_DROP_AT, 0, 1)
		wobbleFill.Size = UDim2.fromScale(math.max(0.02, 1 - w), 1)
		wobbleFill.BackgroundColor3 = Color3.fromRGB(255, 120, 60):Lerp(Color3.fromRGB(120, 190, 255), 1 - w)
	end
end)

------------------------------------------------------------------ oscillation visuelle des œufs portés
RunService.RenderStepped:Connect(function()
	local t = os.clock()
	for _, p in ipairs(Players:GetPlayers()) do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		local weld = root and root:FindFirstChild("EggWeld")
		if weld and weld:IsA("Weld") then
			local w = (p:GetAttribute("EggWobble") or 0) / Config.WOBBLE_DROP_AT
			local amp = 0.04 + w * 0.5
			weld.C0 = Config.EGG_CARRY_OFFSET
				* CFrame.new(math.sin(t * 6) * w * 0.35, 0, 0)
				* CFrame.Angles(math.sin(t * 7.3) * amp, 0, math.cos(t * 6.1) * amp)
		end
	end
end)

------------------------------------------------------------------ poser l'œuf (G / bouton tactile / manette X)
ContextActionService:BindAction("EggDrop", function(_, state)
	if state == Enum.UserInputState.Begin then
		EggAction:FireServer("drop")
	end
	return Enum.ContextActionResult.Sink
end, true, Enum.KeyCode.G, Enum.KeyCode.ButtonX)
ContextActionService:SetTitle("EggDrop", "Poser")
ContextActionService:SetPosition("EggDrop", UDim2.new(1, -170, 1, -150))

------------------------------------------------------------------ cinématique d'introduction
local function playIntro()
	local map = workspace:WaitForChild("EggMountain", 20)
	if not map then
		return
	end
	local gerard = map:WaitForChild("Sommet"):WaitForChild("Gerard", 10)
	local pedestal = map:WaitForChild("Camp"):WaitForChild("EggPedestal", 10)
	if not gerard or not pedestal then
		return
	end
	local camera = workspace.CurrentCamera
	local head = gerard:FindFirstChild("Head") or gerard:FindFirstChildWhichIsA("BasePart")
	local headPos = head.Position
	local facing = head.CFrame.LookVector

	local cine = make("ScreenGui", { Name = "Intro", ResetOnSpawn = false, IgnoreGuiInset = true,
		DisplayOrder = 10, Parent = player.PlayerGui })
	make("Frame", { Parent = cine, Size = UDim2.new(1, 0, 0.12, 0), BackgroundColor3 = Color3.new() })
	make("Frame", { Parent = cine, AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0.12, 0), BackgroundColor3 = Color3.new() })
	local box = make("Frame", { Parent = cine, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 0.86, 0),
		Size = UDim2.new(0.7, 0, 0.16, 0), BackgroundColor3 = DARK, BackgroundTransparency = 0.1 },
		{ corner(16), stroke(Color3.fromRGB(255, 210, 90), 3) })
	label({ Parent = box, Position = UDim2.new(0, 16, 0, 6), Size = UDim2.new(0.4, 0, 0.28, 0),
		Text = "GÉRARD", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 210, 90) })
	local line = label({ Parent = box, Position = UDim2.new(0, 16, 0.32, 0), Size = UDim2.new(1, -32, 0.62, 0),
		Text = "", TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left })
	local skip = make("TextButton", { Parent = cine, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -16, 0.13, 0),
		Size = UDim2.new(0, 110, 0, 36), Text = "Passer ⏭", Font = FONT, TextScaled = true,
		BackgroundColor3 = DARK, TextColor3 = CREAM }, { corner(10) })

	local skipped = false
	skip.Activated:Connect(function()
		skipped = true
	end)

	local function say(text: string, duration: number)
		if skipped then return end
		line.Text = ""
		for i = 1, #text do
			if skipped then return end
			line.Text = string.sub(text, 1, i)
			task.wait(0.022)
		end
		local t0 = os.clock()
		while os.clock() - t0 < duration and not skipped do
			task.wait()
		end
	end

	local function shot(cf: CFrame, time: number)
		if skipped then return end
		TweenService:Create(camera, TweenInfo.new(time, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { CFrame = cf }):Play()
	end

	camera.CameraType = Enum.CameraType.Scriptable
	local closeCam = CFrame.lookAt(headPos + facing * 9 + Vector3.new(2, 1, 0), headPos)
	camera.CFrame = closeCam * CFrame.new(0, 0, 6)
	shot(closeCam, 2.5)
	say("Ah ! Un aventurier ! Ça fait des ANNÉES que j'attends quelqu'un comme toi...", 1.2)
	say("Je veux préparer la meilleure omelette de l'histoire. Mais il me faut un œuf PARFAITEMENT intact.", 1.4)
	shot(CFrame.lookAt(headPos + facing * 60 + Vector3.new(30, 30, 0), headPos + facing * 120 - Vector3.new(0, 50, 0)), 4)
	say("Le problème ? Il y a toute cette montagne entre nous. Des ponts, des rondins, du vent...", 1.5)
	local pedPos = pedestal.Position
	shot(CFrame.lookAt(pedPos + Vector3.new(12, 8, 14), pedPos), 4)
	say("Prends un œuf au camp, en bas, et apporte-le-moi jusqu'ici.", 1.2)
	say("TRANSPORTE CET ŒUF JUSQU'AU SOMMET. NE LE CASSE SURTOUT PAS !", 2)

	camera.CameraType = Enum.CameraType.Custom
	cine:Destroy()
	IntroDone:FireServer()
end

task.spawn(function()
	-- On attend que le serveur ait chargé la sauvegarde
	local t0 = os.clock()
	while player:GetAttribute("IntroSeen") == nil and os.clock() - t0 < 15 do
		task.wait(0.2)
	end
	if player:GetAttribute("IntroSeen") == false then
		if not player.Character then
			player.CharacterAdded:Wait()
		end
		task.wait(1)
		playIntro()
	end
end)
]=])
shared.Parent = RS
server.Parent = SSS
print("EGG MOUNTAIN — scripts installés ! Clique sur Jouer (F5) pour tester.")
