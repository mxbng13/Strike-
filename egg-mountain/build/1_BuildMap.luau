-- EGG MOUNTAIN — Script 1/2 : construit la map de la phase 1 (à coller dans la barre de commandes)
-- Camp de départ -> Forêt des racines (souches, pont fragile, bras rotatif, vent, rondins) -> sommet provisoire de Gérard.
-- ATTENTION : efface le terrain existant et l'ancienne map Signal Trail.

local T = workspace.Terrain
T:Clear()
for _, n in ipairs({ "SignalTrail", "EggMountain", "TestClaude", "Baseplate" }) do
	local o = workspace:FindFirstChild(n)
	if o then o:Destroy() end
end
for _, o in ipairs(workspace:GetChildren()) do
	if o:IsA("SpawnLocation") then o:Destroy() end
end

local root = Instance.new("Folder")
root.Name = "EggMountain"
root.Parent = workspace
local function folder(name, parent)
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent or root
	return f
end
local Camp, Course, Checkpoints, Obstacles, Sommet, Decor =
	folder("Camp"), folder("Course"), folder("Checkpoints"), folder("Obstacles"), folder("Sommet"), folder("Decor")
local rng = Random.new(42)

local C = {
	grass = Color3.fromRGB(96, 170, 70), wood = Color3.fromRGB(120, 80, 45), darkWood = Color3.fromRGB(85, 55, 32),
	stone = Color3.fromRGB(130, 130, 138), plank = Color3.fromRGB(170, 125, 75), rope = Color3.fromRGB(200, 170, 110),
	cream = Color3.fromRGB(252, 248, 236), red = Color3.fromRGB(220, 60, 50), gold = Color3.fromRGB(255, 200, 60),
	leaf = Color3.fromRGB(70, 150, 60),
}

local function part(size, cf, color, mat, parent, shape)
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = mat or Enum.Material.SmoothPlastic
	if shape then p.Shape = shape end
	p.Parent = parent or Course
	return p
end
-- Dalle entre deux points (le dessus passe par p1 et p2)
local function slab(p1, p2, width, thick, color, mat, parent)
	local mid = (p1 + p2) / 2
	local cf = CFrame.lookAt(mid, p2) * CFrame.new(0, -thick / 2, 0)
	return part(Vector3.new(width, thick, (p2 - p1).Magnitude), cf, color, mat, parent), cf
end
local function vcyl(height, diameter, pos, color, mat, parent)
	return part(Vector3.new(height, diameter, diameter), CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(90)), color, mat, parent, Enum.PartType.Cylinder)
end
local function sign(cf, text, w, h, parent, groundY)
	local board = part(Vector3.new(w, h, 0.4), cf, C.plank, Enum.Material.WoodPlanks, parent or Decor)
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Back
	g.Parent = board
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.FredokaOne
	t.TextColor3 = Color3.fromRGB(255, 245, 220)
	t.TextStrokeTransparency = 0.5
	t.Parent = g
	local bottom = cf.Position.Y - h / 2
	local g0 = groundY or (bottom - 4)
	local len = bottom - g0 + 0.5
	part(Vector3.new(0.5, len, 0.5), CFrame.new(cf.Position.X, g0 + len / 2 - 0.25, cf.Position.Z + 0.45), C.darkWood, Enum.Material.Wood, parent or Decor)
	return board
end
local function eggShape(pos, parent, color)
	local e = part(Vector3.new(1.8, 1.8, 1.8), CFrame.new(pos), color or C.cream, Enum.Material.SmoothPlastic, parent, Enum.PartType.Ball)
	local m = Instance.new("SpecialMesh")
	m.MeshType = Enum.MeshType.Sphere
	m.Scale = Vector3.new(1, 1.3, 1)
	m.Parent = e
	e.CanCollide = false
	return e
end

---------------------------------------------------------------- terrain : canyon de la forêt
T:FillBlock(CFrame.new(0, -30, -230), Vector3.new(320, 4, 640), Enum.Material.Grass)
T:FillBlock(CFrame.new(0, -29, -230), Vector3.new(16, 3, 640), Enum.Material.Water)
T:FillBlock(CFrame.new(0, -16, 0), Vector3.new(92, 32, 92), Enum.Material.Grass) -- plateau du camp (dessus à y=0)
T:FillBlock(CFrame.new(0, 18, -417), Vector3.new(48, 100, 40), Enum.Material.Rock) -- pilier du sommet
for i = 0, 9 do
	local z = 20 - i * 55
	for _, side in ipairs({ -1, 1 }) do
		local r = rng:NextInteger(45, 65)
		local c = Vector3.new(side * rng:NextInteger(120, 140), rng:NextInteger(-10, 20), z)
		T:FillBall(c, r, Enum.Material.Rock)
		T:FillBall(c + Vector3.new(0, r - 8, 0), 14, Enum.Material.Snow)
	end
end
T:FillBall(Vector3.new(0, 40, -540), 90, Enum.Material.Rock) -- la montagne géante au fond
T:FillBall(Vector3.new(0, 120, -540), 34, Enum.Material.Snow)
T:FillBall(Vector3.new(-70, 20, -510), 60, Enum.Material.Rock)
T:FillBall(Vector3.new(80, 25, -500), 65, Enum.Material.Rock)

-- Zone de vide (tomber = perdre son œuf)
local kill = part(Vector3.new(330, 2, 660), CFrame.new(0, -20, -230), C.red, nil, Obstacles)
kill.Name = "Vide"
kill.Transparency = 1
kill.CanCollide = false
kill:SetAttribute("KillZone", true)

---------------------------------------------------------------- arbres géants de la forêt des racines
local function giantTree(x, z)
	local d = rng:NextNumber(8, 14)
	local h = rng:NextNumber(110, 140)
	local m = Instance.new("Model")
	m.Name = "ArbreGeant"
	vcyl(h, d, Vector3.new(x, -28 + h / 2, z), C.wood, Enum.Material.Wood, m)
	for k = 1, 4 do
		local a = k / 4 * math.pi * 2 + rng:NextNumber(-0.4, 0.4)
		local out = Vector3.new(math.cos(a), 0, math.sin(a))
		local base = Vector3.new(x, -28, z) + out * (d / 2 + 6)
		slab(base, Vector3.new(x, -10, z) + out * (d / 2 - 1), 3, 3, C.darkWood, Enum.Material.Wood, m)
	end
	local top = Vector3.new(x, -28 + h, z)
	local g = C.leaf:Lerp(Color3.fromRGB(40, 110, 50), rng:NextNumber())
	part(Vector3.new(34, 34, 34), CFrame.new(top), g, Enum.Material.Grass, m, Enum.PartType.Ball).CanCollide = false
	part(Vector3.new(24, 24, 24), CFrame.new(top + Vector3.new(12, -6, 6)), g, Enum.Material.Grass, m, Enum.PartType.Ball).CanCollide = false
	part(Vector3.new(24, 24, 24), CFrame.new(top + Vector3.new(-12, -4, -8)), g, Enum.Material.Grass, m, Enum.PartType.Ball).CanCollide = false
	m.Parent = Decor
end
for z = -70, -372, -28 do
	giantTree(rng:NextInteger(-62, -30), z + rng:NextInteger(-8, 8))
	giantTree(rng:NextInteger(30, 62), z + rng:NextInteger(-8, 8))
end

---------------------------------------------------------------- CAMP DE DÉPART
local spawn = Instance.new("SpawnLocation")
spawn.Name = "CampSpawn"
spawn.Anchored = true
spawn.Size = Vector3.new(10, 1, 10)
spawn.CFrame = CFrame.new(0, 0.5, 28)
spawn.Color = C.plank
spawn.Material = Enum.Material.WoodPlanks
spawn.Duration = 0
spawn.Parent = Camp

-- Le piédestal aux œufs
local pedestal = vcyl(3, 6, Vector3.new(0, 1.5, -14), C.stone, Enum.Material.Slate, Camp)
pedestal.Name = "EggPedestal"
vcyl(1, 7, Vector3.new(0, 3.3, -14), Color3.fromRGB(190, 160, 90), Enum.Material.Grass, Camp) -- nid de paille
eggShape(Vector3.new(-1.2, 4.6, -14), Camp)
eggShape(Vector3.new(1.2, 4.6, -14.4), Camp)
eggShape(Vector3.new(0, 4.6, -12.8), Camp)
local glow = Instance.new("PointLight")
glow.Color = C.gold
glow.Range = 14
glow.Brightness = 1.5
glow.Parent = pedestal
sign(CFrame.new(0, 9, -18), "🥚 PRENDS TON ŒUF ICI 🥚", 12, 3, Camp, 0)

-- Grand panneau EGG MOUNTAIN
local banner = part(Vector3.new(30, 8, 1), CFrame.new(0, 14, 40), C.darkWood, Enum.Material.WoodPlanks, Camp)
do
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Front
	g.Parent = banner
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = "🥚 EGG MOUNTAIN 🥚"
	t.TextScaled = true
	t.Font = Enum.Font.FredokaOne
	t.TextColor3 = C.gold
	t.TextStrokeTransparency = 0
	t.Parent = g
	part(Vector3.new(1, 18, 1), CFrame.new(-15.5, 9, 40), C.darkWood, Enum.Material.Wood, Camp)
	part(Vector3.new(1, 18, 1), CFrame.new(15.5, 9, 40), C.darkWood, Enum.Material.Wood, Camp)
end

-- Feu de camp
local fireCenter = Vector3.new(-14, 0, 6)
for i = 1, 8 do
	local a = i / 8 * math.pi * 2
	part(Vector3.new(1.4, 1, 1.4), CFrame.new(fireCenter + Vector3.new(math.cos(a) * 3, 0.4, math.sin(a) * 3)), C.stone, Enum.Material.Slate, Camp)
end
local fireCore = part(Vector3.new(1, 1, 1), CFrame.new(fireCenter + Vector3.new(0, 1, 0)), C.red, nil, Camp)
fireCore.Transparency = 1
fireCore.CanCollide = false
Instance.new("Fire", fireCore).Size = 6
local fl = Instance.new("PointLight", fireCore)
fl.Color = Color3.fromRGB(255, 160, 80)
fl.Range = 22
fl.Brightness = 2
part(Vector3.new(4, 0.8, 0.8), CFrame.new(fireCenter + Vector3.new(0, 0.4, 0)) * CFrame.Angles(0, math.rad(45), 0), C.darkWood, Enum.Material.Wood, Camp)
part(Vector3.new(4, 0.8, 0.8), CFrame.new(fireCenter + Vector3.new(0, 0.8, 0)) * CFrame.Angles(0, math.rad(-45), 0), C.darkWood, Enum.Material.Wood, Camp)
for _, a in ipairs({ 0, 2.1, 4.2 }) do -- bancs en rondins
	local p = fireCenter + Vector3.new(math.cos(a) * 7, 0.8, math.sin(a) * 7)
	part(Vector3.new(5, 1.6, 1.6), CFrame.lookAt(p, fireCenter) * CFrame.Angles(0, math.rad(90), 0), C.wood, Enum.Material.Wood, Camp, Enum.PartType.Cylinder)
end

-- Tentes et caisses
for _, t in ipairs({ { Vector3.new(22, 0, 14), Color3.fromRGB(230, 120, 40) }, { Vector3.new(26, 0, -6), Color3.fromRGB(60, 120, 200) }, { Vector3.new(-26, 0, -12), Color3.fromRGB(200, 70, 90) } }) do
	part(Vector3.new(8, 8, 10), CFrame.new(t[1]) * CFrame.Angles(0, math.rad(rng:NextInteger(-30, 30)), math.rad(45)), t[2], Enum.Material.Fabric, Camp)
end
for i = 1, 6 do
	local p = Vector3.new(rng:NextInteger(14, 30) * (i % 2 == 0 and 1 or -1), 1.5, rng:NextInteger(-30, 30))
	part(Vector3.new(3, 3, 3), CFrame.new(p) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), C.plank, Enum.Material.WoodPlanks, Camp)
end
-- Petits arbres autour du camp
for i = 1, 14 do
	local a = i / 14 * math.pi * 2
	local p = Vector3.new(math.cos(a) * 40, 0, math.sin(a) * 40)
	if p.Z > -30 then
		local h = rng:NextInteger(9, 14)
		vcyl(h, 1.8, p + Vector3.new(0, h / 2, 0), C.wood, Enum.Material.Wood, Decor)
		part(Vector3.new(9, 9, 9), CFrame.new(p + Vector3.new(0, h, 0)), C.leaf, Enum.Material.Grass, Decor, Enum.PartType.Ball)
	end
end
sign(CFrame.new(10, 6, -38), "⛰️ ASCENSION ↑\nFORÊT DES RACINES", 10, 4, Camp, 0)

---------------------------------------------------------------- BIOME 2 : FORÊT DES RACINES
local function checkpoint(index, pos)
	local pad = part(Vector3.new(7, 0.4, 7), CFrame.new(pos + Vector3.new(0, 0.2, 0)), Color3.fromRGB(90, 200, 120), Enum.Material.Neon, Checkpoints)
	pad.Name = "Checkpoint" .. index
	pad:SetAttribute("Index", index)
	part(Vector3.new(0.4, 9, 0.4), CFrame.new(pos + Vector3.new(4, 4.5, 0)), C.darkWood, Enum.Material.Wood, Decor)
	part(Vector3.new(0.2, 2.4, 3.6), CFrame.new(pos + Vector3.new(4, 7.6, -1.9)), C.red, Enum.Material.Fabric, Decor)
end

-- Rampe de sortie du camp
slab(Vector3.new(0, 0, -45), Vector3.new(0, 12, -75), 12, 1.5, C.darkWood, Enum.Material.WoodPlanks)
part(Vector3.new(16, 2, 14), CFrame.new(0, 11, -82), C.grass, Enum.Material.Grass)

-- Obstacle 1 : souches géantes en escalier
for i = 1, 7 do
	local top = 12 + i * 1.5
	local x = (i % 2 == 0) and 3.5 or -3.5
	vcyl(30, 6, Vector3.new(x, top - 15, -95 - (i - 1) * 9), C.wood, Enum.Material.Wood)
	vcyl(0.3, 5, Vector3.new(x, top + 0.05, -95 - (i - 1) * 9), Color3.fromRGB(190, 150, 95), Enum.Material.Wood).CanCollide = false
end

-- Checkpoint 1
part(Vector3.new(18, 2, 16), CFrame.new(0, 21.5, -163), C.grass, Enum.Material.Grass)
checkpoint(1, Vector3.new(0, 22.5, -163))
sign(CFrame.new(-6, 27, -168), "⚠️ PONT FRAGILE\nNe traîne pas !", 7, 3, Decor, 22.5)

-- Obstacle 2 : pont suspendu avec planches qui cèdent
local fragile = { [4] = true, [7] = true, [10] = true, [13] = true, [16] = true }
for i = 1, 18 do
	local z = -172.4 - (i - 1) * 2.75
	local plank = part(Vector3.new(10, 0.8, 2.1), CFrame.new(0, 22.1, z) * CFrame.Angles(0, 0, math.rad(rng:NextNumber(-2, 2))), C.plank, Enum.Material.WoodPlanks)
	if fragile[i] then
		plank.Name = "PlancheFragile"
		plank.Color = Color3.fromRGB(180, 140, 95)
		plank:SetAttribute("Fragile", true)
	end
end
for _, x in ipairs({ -5.4, 5.4 }) do
	part(Vector3.new(0.4, 0.4, 50), CFrame.new(x, 25.3, -196), C.rope, Enum.Material.Fabric)
	for _, z in ipairs({ -171.5, -220.5 }) do
		part(Vector3.new(0.8, 5, 0.8), CFrame.new(x, 24.5, z), C.darkWood, Enum.Material.Wood)
	end
end

-- Checkpoint 2
part(Vector3.new(18, 2, 18), CFrame.new(0, 21.5, -230), C.grass, Enum.Material.Grass)
checkpoint(2, Vector3.new(0, 22.5, -230))

-- Obstacle 3 : plateau rond avec bras rotatif (saute par-dessus !)
part(Vector3.new(8, 1, 3), CFrame.new(0, 22, -240.5), C.plank, Enum.Material.WoodPlanks)
vcyl(2, 32, Vector3.new(0, 21.5, -257), C.wood, Enum.Material.Wood)
local hub = part(Vector3.new(2, 4, 2), CFrame.new(0, 24.5, -257), C.stone, Enum.Material.Slate, Obstacles)
hub.Name = "SweeperHub"
local arm = part(Vector3.new(30, 1.4, 1.4), CFrame.new(0, 23.6, -257), C.red, Enum.Material.SmoothPlastic, Obstacles)
arm.Name = "SweeperArm"
arm.Anchored = false
arm.CustomPhysicalProperties = PhysicalProperties.new(0.4, 0.3, 0.5)
arm:SetAttribute("Sweeper", true)
do
	local a0 = Instance.new("Attachment")
	a0.CFrame = CFrame.new(0, -0.9, 0) * CFrame.Angles(0, 0, math.rad(90))
	a0.Parent = hub
	local a1 = Instance.new("Attachment")
	a1.CFrame = CFrame.Angles(0, 0, math.rad(90))
	a1.Parent = arm
	local hinge = Instance.new("HingeConstraint")
	hinge.Attachment0 = a0
	hinge.Attachment1 = a1
	hinge.ActuatorType = Enum.ActuatorType.Motor
	hinge.AngularVelocity = 1.4
	hinge.MotorMaxTorque = 1e8
	hinge.Parent = arm
	local nc = Instance.new("NoCollisionConstraint")
	nc.Part0 = hub
	nc.Part1 = arm
	nc.Parent = arm
end

-- Obstacle 4 : la grande racine dans le vent
slab(Vector3.new(0, 22.5, -273), Vector3.new(0, 40, -313), 10, 3, C.darkWood, Enum.Material.Wood)
local wind = part(Vector3.new(26, 18, 40), CFrame.new(0, 38, -293), Color3.new(1, 1, 1), nil, Obstacles)
wind.Name = "ZoneDeVent"
wind.Transparency = 1
wind.CanCollide = false
wind.CanQuery = false
wind.CanTouch = false
wind:SetAttribute("Wind", true)
do
	local e = Instance.new("ParticleEmitter")
	e.Shape = Enum.ParticleEmitterShape.Box
	e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
	e.EmissionDirection = Enum.NormalId.Right
	e.Speed = NumberRange.new(35, 50)
	e.SpreadAngle = Vector2.new(5, 5)
	e.Rate = 40
	e.Lifetime = NumberRange.new(0.6, 1)
	e.Size = NumberSequence.new(0.25)
	e.Transparency = NumberSequence.new(0.3, 1)
	e.Color = ColorSequence.new(Color3.fromRGB(230, 240, 255))
	e.LightEmission = 0.5
	e.Parent = wind
end
sign(CFrame.new(5, 27, -269), "💨 ZONE DE VENT\nVa doucement !", 6, 3, Decor, 22.5)

-- Checkpoint 3
part(Vector3.new(20, 2, 18), CFrame.new(0, 39, -322), C.grass, Enum.Material.Grass)
checkpoint(3, Vector3.new(0, 40, -322))
sign(CFrame.new(-7, 45, -327), "🪵 RONDINS !\nSaute par-dessus", 7, 3, Decor, 40)

-- Obstacle 5 : la pente aux rondins
local p1, p2 = Vector3.new(0, 40, -331), Vector3.new(0, 70, -401)
local _, slopeCf = slab(p1, p2, 16, 2, C.wood, Enum.Material.Wood)
local slopeLen = (p2 - p1).Magnitude
for _, x in ipairs({ -8.5, 8.5 }) do
	part(Vector3.new(1, 5, slopeLen), slopeCf * CFrame.new(x, 2.5, 0), C.darkWood, Enum.Material.Wood)
end
local spawnPos = Vector3.new(0, 74, -397)
local logSpawner = part(Vector3.new(2, 2, 2), CFrame.lookAt(spawnPos, spawnPos + Vector3.new(0, -30, 70)), C.red, nil, Obstacles)
logSpawner.Name = "LogSpawner"
logSpawner.Transparency = 1
logSpawner.CanCollide = false
logSpawner.CanQuery = false
logSpawner.CanTouch = false
logSpawner:SetAttribute("LogSpawner", true)
logSpawner:SetAttribute("Interval", 3.2)
local logKill = part(Vector3.new(18, 8, 4), CFrame.new(0, 43, -333), C.red, nil, Obstacles)
logKill.Name = "LogKill"
logKill.Transparency = 1
logKill.CanCollide = false
logKill.CanQuery = false
logKill:SetAttribute("LogKill", true)

---------------------------------------------------------------- SOMMET PROVISOIRE : la cabane de Gérard
part(Vector3.new(44, 2, 32), CFrame.new(0, 69, -417), C.grass, Enum.Material.Grass, Sommet)
local base = Vector3.new(0, 70, -427)
part(Vector3.new(16, 0.6, 10), CFrame.new(base + Vector3.new(0, 0.3, 0)), C.plank, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(16, 8, 1), CFrame.new(base + Vector3.new(0, 4, -5)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(1, 8, 10), CFrame.new(base + Vector3.new(-8, 4, 0)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(1, 8, 10), CFrame.new(base + Vector3.new(8, 4, 0)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(5.5, 8, 1), CFrame.new(base + Vector3.new(-5.25, 4, 5)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(5.5, 8, 1), CFrame.new(base + Vector3.new(5.25, 4, 5)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(5, 2, 1), CFrame.new(base + Vector3.new(0, 7, 5)), C.wood, Enum.Material.WoodPlanks, Sommet)
part(Vector3.new(18, 0.8, 7.5), CFrame.new(base + Vector3.new(0, 10, -2.6)) * CFrame.Angles(math.rad(35), 0, 0), C.red, Enum.Material.Slate, Sommet)
part(Vector3.new(18, 0.8, 7.5), CFrame.new(base + Vector3.new(0, 10, 2.6)) * CFrame.Angles(math.rad(-35), 0, 0), C.red, Enum.Material.Slate, Sommet)
local chimney = part(Vector3.new(2, 5, 2), CFrame.new(base + Vector3.new(5, 12, -2)), C.stone, Enum.Material.Brick, Sommet)
do
	local smoke = Instance.new("Smoke")
	smoke.RiseVelocity = 4
	smoke.Size = 3
	smoke.Opacity = 0.15
	smoke.Parent = chimney
end
sign(CFrame.new(-12, 76, -404), "🏔️ SOMMET (prototype)\nCabane de Gérard", 10, 4, Sommet, 70)

-- Table de livraison
local deliveryTable = part(Vector3.new(6, 0.6, 3.5), CFrame.new(6, 73.3, -416), C.plank, Enum.Material.WoodPlanks, Sommet)
deliveryTable.Name = "DeliveryTable"
for _, o in ipairs({ Vector3.new(-2.6, 0, -1.4), Vector3.new(2.6, 0, -1.4), Vector3.new(-2.6, 0, 1.4), Vector3.new(2.6, 0, 1.4) }) do
	part(Vector3.new(0.5, 3, 0.5), CFrame.new(Vector3.new(6, 71.5, -416) + o), C.darkWood, Enum.Material.Wood, Sommet)
end
vcyl(0.15, 2.4, Vector3.new(6, 73.7, -416), Color3.new(1, 1, 1), Enum.Material.SmoothPlastic, Sommet).CanCollide = false

-- Gérard (le chef qui attend son omelette), tourné vers les joueurs qui arrivent
local gerard = Instance.new("Model")
gerard.Name = "Gerard"
do
	local cf0 = CFrame.new(1.5, 70, -417) * CFrame.Angles(0, math.pi, 0)
	local function gp(size, offset, color, mat, shape)
		local p = part(size, cf0 * CFrame.new(offset), color, mat, gerard, shape)
		return p
	end
	gp(Vector3.new(1, 2, 1), Vector3.new(-0.5, 1, 0), Color3.fromRGB(50, 50, 60))
	gp(Vector3.new(1, 2, 1), Vector3.new(0.5, 1, 0), Color3.fromRGB(50, 50, 60))
	local torso = gp(Vector3.new(2, 2, 1), Vector3.new(0, 3, 0), Color3.new(1, 1, 1), Enum.Material.Fabric)
	torso.Name = "Torso"
	gp(Vector3.new(1, 2, 1), Vector3.new(-1.5, 3, 0), Color3.new(1, 1, 1), Enum.Material.Fabric)
	gp(Vector3.new(1, 2, 1), Vector3.new(1.5, 3, 0), Color3.new(1, 1, 1), Enum.Material.Fabric)
	local head = gp(Vector3.new(2, 1, 1), Vector3.new(0, 4.5, 0), Color3.fromRGB(240, 200, 160))
	head.Name = "Head"
	local hm = Instance.new("SpecialMesh")
	hm.MeshType = Enum.MeshType.Head
	hm.Scale = Vector3.new(1.25, 1.25, 1.25)
	hm.Parent = head
	local face = Instance.new("Decal")
	face.Texture = "rbxasset://textures/face.png"
	face.Face = Enum.NormalId.Front
	face.Parent = head
	gp(Vector3.new(1.2, 0.22, 0.12), Vector3.new(0, 4.25, -0.64), Color3.fromRGB(60, 40, 25))
	local hat = gp(Vector3.new(1.3, 1.5, 1.5), Vector3.new(0, 5.6, 0), Color3.new(1, 1, 1), Enum.Material.Fabric, Enum.PartType.Cylinder)
	hat.CFrame = hat.CFrame * CFrame.Angles(0, 0, math.rad(90))
	gp(Vector3.new(2.1, 2.1, 2.1), Vector3.new(0, 6.5, 0), Color3.new(1, 1, 1), Enum.Material.Fabric, Enum.PartType.Ball)
	gerard.PrimaryPart = torso
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 200, 0, 50)
	bb.StudsOffset = Vector3.new(0, 3.2, 0)
	bb.Adornee = head
	bb.Parent = head
	local nameT = Instance.new("TextLabel")
	nameT.Size = UDim2.fromScale(1, 1)
	nameT.BackgroundTransparency = 1
	nameT.Text = "GÉRARD\n« Mon œuf !! »"
	nameT.TextScaled = true
	nameT.Font = Enum.Font.FredokaOne
	nameT.TextColor3 = C.gold
	nameT.TextStrokeTransparency = 0.3
	nameT.Parent = bb
end
gerard.Parent = Sommet

---------------------------------------------------------------- lumière et ambiance
local L = game:GetService("Lighting")
L.ClockTime = 15.5
L.Brightness = 2.2
L.OutdoorAmbient = Color3.fromRGB(140, 140, 150)
local function lightFx(class)
	local o = L:FindFirstChildOfClass(class) or Instance.new(class)
	o.Parent = L
	return o
end
local atm = lightFx("Atmosphere")
atm.Density = 0.3
atm.Haze = 1.2
atm.Color = Color3.fromRGB(220, 235, 255)
atm.Decay = Color3.fromRGB(110, 140, 120)
local cc = lightFx("ColorCorrectionEffect")
cc.Saturation = 0.15
cc.Contrast = 0.05
local bloom = lightFx("BloomEffect")
bloom.Intensity = 0.4
bloom.Threshold = 1.5
lightFx("SunRaysEffect").Intensity = 0.06

print("EGG MOUNTAIN — map de la phase 1 construite ! Colle maintenant le script 2/2.")
