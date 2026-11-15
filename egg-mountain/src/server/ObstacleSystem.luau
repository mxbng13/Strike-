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
