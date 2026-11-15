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
