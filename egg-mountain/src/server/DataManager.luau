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
