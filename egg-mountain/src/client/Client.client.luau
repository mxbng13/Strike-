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
