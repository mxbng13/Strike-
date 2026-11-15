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
