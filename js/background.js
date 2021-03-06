var wyn = {};
	wyn.version = chrome.runtime.getManifest().version,
	wyn.notificationSound = new Audio("sound/notification.mp3"),
	wyn.isConnected = false,
	wyn.isTimedout = false,
	wyn.batchChecking = false,
	wyn.hasBatchChanged = false,
	wyn.activeBatchCheckings = [],
	wyn.activeCheckings = [],
	wyn.strings = {
		"notification_watch": getString("notificationWatch"),
		"notification_watch_icon": "img/ic_play.png",
		"notification_close": getString("notificationClose"),
		"notification_close_icon": "img/ic_close.png",
		"notification_main_icon": "img/ic_youtube.png",
		"notification_log_check": getString("notificationLogCheck"),
		"notification_log_new": getString("notificationLogNew"),
		"snackbar_nonewvideos": getString("snackbarNoNewVideos"),
		"connect_success": getString("connectSuccess"),
		"connect_failed": getString("connectFailed"),
		"update_channels_init": getString("updateChannelsInit"),
		"update_channels_complete": getString("updateChannelsComplete"),
		"update_channels_failed": getString("updateChannelsFailed"),
		"update_channels_failed_channel_prefix": getString("updateChannelsFailedChannelPrefix"),
		"update_channels_failed_channel_suffix": getString("updateChannelsFailedChannelSuffix"),
		"add_channel_init": getString("addChannelInit"),
		"add_channel_failed": getString("addChannelFailed"),
		"removed_channel": getString("removedChannel"),
		"remove_channel": getString("removeChannel"),
		"log_color_prefix": "%c",
		"log_color_green": "font-weight: bold; color: #2E7D32",
		"log_color_red": "font-weight: bold; color: #B71C1C",
		"info_views": getCommonString("views"),
		"info_likes": getCommonString("likes"),
		"info_dislikes": getCommonString("dislikes"),
		"info_by": getCommonString("by"),
	},
	wyn.apiKeys = [
		"AIzaSyA8W5tYDVst9tnMpnV56OSjMvHSD70T7oU",
		"AIzaSyBAtN5QYKFQnk9Rgjjn6FrTl48UsS2mm34",
		"AIzaSyDA1LJAP5d9tUQAn_liibpCsdtgAgqOB20",
		"AIzaSyBi6pSx4oym_xjxmswbIT-4eQyUW9t27G8",
		"AIzaSyBo6e-Ea_nIaf6dEd4NMJo4x5IXYd64nUw",
	];
	var apiKeyIndex = Math.floor(Math.random() * wyn.apiKeys.length);
	console.log("Using API Key #" + (apiKeyIndex + 1));
	wyn.apiKey = wyn.apiKeys[apiKeyIndex];

if(localStorage.getItem("channels") == null)
	localStorage.setItem("channels", JSON.stringify([]));
if(localStorage.getItem("settings") == null)
	localStorage.setItem("settings", JSON.stringify({
		notifications: {
			enabled: true,
			volume: 100
		},
		tts: {
			enabled: false,
			type: 1
		},
		addBtn: {
			enabled: true
		},
		updated: {
			enabled: false
		}
	}));

fixItems();
function fixItems(){
	var settings = JSON.parse(localStorage.getItem("settings"));
	if(typeof settings.addBtn === "undefined"){
		settings.addBtn = {
			enabled: true
		};
		localStorage.setItem("settings", JSON.stringify(settings));
	}
	if(typeof settings.updated === "undefined"){
		settings.updated = {
			enabled: false
		};
		localStorage.setItem("settings", JSON.stringify(settings));
	}
}

chrome.notifications.onClicked.addListener(onNotificationClick);
chrome.notifications.onButtonClicked.addListener(onNotificationButtonClick);
chrome.notifications.onClosed.addListener(onNotificationClosed);

chrome.runtime.onInstalled.addListener(function(details){
    if(details.reason == "install"){
        console.log("First Launch!");
		wyn.firstLaunch();
    }else if(details.reason == "update"){
        var thisVersion = chrome.runtime.getManifest().version;
		if(details.previousVersion != thisVersion){
			console.log("Updated from " + details.previousVersion + " to " + thisVersion);
			
			var settings = JSON.parse(localStorage.getItem("settings"));
			settings.updated.enabled = true;
			localStorage.setItem("settings", JSON.stringify(settings));
		}
    }
});

wyn.firstLaunch = function(){
	createTab("chrome-extension://" + chrome.runtime.id + "/pages/first-launch.html");
};

$(function(){
	$.ajaxSetup({
		type: "GET",
		dataType: "json",
		timeout: 5*60*1000, // Timeout ajax requests after 5 minutes
	});
	
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
		switch (request.type) {
			case "checkYoutubeBatch":
				sendResponse(checkYoutubeBatch(request.refresh));
				break;
			case "checkYoutube":
				sendResponse(checkYoutube(request.name));
				break;
			case "setYoutube":
				if(request.contentScript)
					sendResponse(setYoutube(request.name, request.refresh, true));
				else
					sendResponse(setYoutube(request.name, request.refresh));
				break;
			case "testNotify":
				sendResponse(wyn.testNotify());
				break;
			case "removeYoutube":
				if(request.contentScript)
					sendResponse(removeYoutube(request.num, request.name, request.refresh, true));
				else
					sendResponse(removeYoutube(request.num, request.name, request.refresh));
				break;
			case "doesYoutubeExist":
				sendResponse(doesYoutubeExist(request.id, request.index));
				break;
			case "showAddButton":
				var settings = JSON.parse(localStorage.getItem("settings"));
				sendResponse(settings.addBtn.enabled);
				break;
		}
	});
	
	checkYoutubeStatus();
});

/**
 *  Gets the string from the locales appropriate to background.js
 *  
 *  @param {string} name A valid localized string which doesn't include 'settingsJs'
 *  @returns {string} The localized string
 */
function getString(name) {
	return chrome.i18n.getMessage("background_" + name);
}

/**
 *  Gets the string from the locales
 *  
 *  @param {string} name A valid localized string which doesn't include 'common'
 *  @returns {string} The localized string
 */
function getCommonString(name) {
	return chrome.i18n.getMessage("common_" + name);
}

/**
 *  Updates all channels stored's information
 *  Request is made once.
 *  
 *  @param {boolean} [refresh=false] Refreshes the options page after execution
 */
function updateChannelsInfo(refresh){
	refresh = refresh || false;
	
	console.log(wyn.strings.update_channels_init);
	
	var channels = JSON.parse(localStorage.getItem("channels"));
	var channelIdList = "";
	for(var i = 0; i < channels.length; i++){
		channelIdList += channels[i].id + ",";
	}
	channelIdList = channelIdList.substring(0, channelIdList.length-1);
	var url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&maxResults=1&id=" + channelIdList + "&key=" + wyn.apiKey;
	$.ajax({
		url: url,
		error: function(){
			console.log(wyn.strings.update_channels_failed);
		},
		success: function(data){
			for(var i = 0; i < channels.length; i++) {
				for(var j = 0; j < data.items.length; j++){
					if(data.items[j].id == channels[i].id){
						channels[i].name				= data.items[j].snippet.title;
						channels[i].thumbnail			= data.items[j].snippet.thumbnails.default.url;
						channels[i].viewCount			= data.items[j].statistics.viewCount;
						channels[i].subscriberCount		= data.items[j].statistics.subscriberCount;
						break;
					}
				}
			}
			localStorage.setItem("channels", JSON.stringify(channels));
		}
	});
}

/**
 *  Pings the YouTube Data API servers
 */
function checkYoutubeStatus(){
	var url = "https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&key=" + wyn.apiKey;
	$.ajax({
		url: url,
		statusCode: {
			400: function() {
				wyn.isConnected = true;
				chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.connect_success});
				console.log(wyn.strings.log_color_prefix + wyn.strings.connect_success, wyn.strings.log_color_green);
				updateChannelsInfo(true);
				checkYoutubeBatch(true);
				setInterval(function(){
					checkYoutubeBatch(true);
				}, 1000*60*5);
			},
			403: function() {
				var apiKeyIndex = Math.floor(Math.random() * wyn.apiKeys.length);
				console.log("Using API Key #" + (apiKeyIndex + 1) + " due to limited quota");
				wyn.apiKey = wyn.apiKeys[apiKeyIndex];
				checkYoutubeStatus();
				return;
			}
		},
		error: function(XMLHttpRequest, textStatus, error) {
			if(XMLHttpRequest.status == 403){
				var apiKeyIndex = Math.floor(Math.random() * wyn.apiKeys.length);
				console.log("Using API Key #" + (apiKeyIndex + 1) + " due to limited quota");
				wyn.apiKey = wyn.apiKeys[apiKeyIndex];
				checkYoutubeStatus();
				return;
			}
			
			if(XMLHttpRequest.statusText != "OK" && XMLHttpRequest.status != 400){
				wyn.isConnected = false;
				chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.connect_failed});
				console.log(wyn.strings.log_color_prefix + wyn.strings.connect_failed, wyn.strings.log_color_green);
				if(!wyn.isTimedout){
					wyn.isTimedout = true;
					setTimeout(function(){
						wyn.isTimedout = false;
						checkYoutubeStatus();
					}, 1000*60);
				}
			}
		},
		success: function(data) {
			if(data.status == "success" && !wyn.isConnected){
				wyn.isConnected = true;
				chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.connect_success});
				console.log(wyn.strings.log_color_prefix + wyn.strings.connect_success, wyn.strings.log_color_green);
				updateChannelsInfo(true);
				checkYoutubeBatch(true);
				setInterval(function(){
					checkYoutubeBatch(true);
				}, 1000*60*5);
			}else{
				wyn.isConnected = false;
				chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.connect_failed});
				console.log(wyn.strings.log_color_prefix + wyn.strings.connect_failed, wyn.strings.log_color_green);
				if(!wyn.isTimedout){
					wyn.isTimedout = true;
					setTimeout(function(){
						wyn.isTimedout = false;
						checkYoutubeStatus();
					}, 1000*60);
				}
			}
		}
	});
}

/**
 *  Adds a new channel
 *  
 *  @param {string} name The name of the channel to get information from.
 *  @param {boolean} [refresh=false] Refreshes the options page after execution
 *  @param {boolean} [fromContentScript=false] If the request was from a content script
 */
function setYoutube(name, refresh, fromContentScript){
	refresh = refresh || false;
	fromContentScript = fromContentScript || false;
	
	var url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=" + name + "&key=" + wyn.apiKey;
	console.log(wyn.strings.add_channel_init + "\"" + name + "\"");
	$.ajax({
		url: url,
		error: function(data) {
			console.log(wyn.strings.add_channel_failed + "\"" + name + "\"");
			if(!fromContentScript)
				chrome.extension.sendMessage({type: "addChannelFailed"});
		},
		success: function(data) {
			if(data.items.length == 1){
				var id = data.items[0].id.channelId;
				var url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&maxResults=1&id=" + id + "&key=" + wyn.apiKey;
				$.ajax({
					url: url,
					success: function(data) {
						var output = {
							"id": 				data.items[0].id,
							"playlistId": 		data.items[0].contentDetails.relatedPlaylists.uploads,
							"name":				data.items[0].snippet.title,
							"thumbnail":		data.items[0].snippet.thumbnails.default.url,
							"viewCount":		data.items[0].statistics.viewCount,
							"subscriberCount":	data.items[0].statistics.subscriberCount,
							"latestVideo":	{
								"id": 			"",
								"title":		"",
								"description":	"",
								"timestamp":	"",
								"thumbnail":	"",
								"views":		"",
								"duration":		"",
								"likes":		"",
								"dislikes":		""
							}
						};
						var arr = JSON.parse(localStorage.getItem("channels"));
						arr.push(output);
						localStorage.setItem("channels", JSON.stringify(arr));
						checkYoutube(arr.length-1, refresh);
					}
				});
			}else{
				console.log(wyn.strings.add_channel_failed + "\"" + name + "\"");
				if(!fromContentScript)
					chrome.extension.sendMessage({type: "addChannelFailed"});
			}
		}
	});
	/**
	 *  FIX THIS: because of async, the content script will recieve a null value if returns inside async request.
	 *  Possible fixes:
	 *  	- Synchronous
	 *  Problem:
	 *  	- Stops code in background from executing
	 */
	if(fromContentScript)
		return true;
}

/**
 *  Removes an existing channel
 *  
 *  @param {number} type The type of the channel name (0 = index, 1 = channelID)
 *  @param {string} name The name of the channel's name
 *  @param {boolean} [refresh=false] Refreshes the options page after execution
 *  @param {boolean} [fromContentScript=false] If the request was from a content script
 */
function removeYoutube(type, name, refresh, fromContentScript){
	refresh = refresh || false;
	fromContentScript = fromContentScript || false;
	
	type = parseInt(type);
	if(type == 0){
		var id = parseInt(name),
			channels = JSON.parse(localStorage.getItem("channels")),
			channelName = channels[id].name;
		console.log(wyn.strings.remove_channel + "\"" + channelName + "\"");
		channels.splice(id, 1);
		localStorage.setItem("channels", JSON.stringify(channels));
		
		if(refresh)
			chrome.extension.sendMessage({type: "refreshPage"});
		else
			chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.removed_channel + "\"" + channelName + "\""});
		if(fromContentScript)
			return true;
	}else if(type == 1){
		var channels = JSON.parse(localStorage.getItem("channels"));
		for(var i = 0; i < channels.length; i++){
			if(channels[i].id == name){
				var channelName = channels[i].name;
				channels.splice(i, 1);
				console.log(wyn.strings.remove_channel + "\"" + channelName + "\"");
				localStorage.setItem("channels", JSON.stringify(channels));
				if(refresh)
					chrome.extension.sendMessage({type: "refreshPage"});
				else
					chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.removed_channel + "\"" + channelName + "\""});
				if(fromContentScript)
					return true;
				return;
			}
		}
		return false;
	}
}

/**
 *  Checks if a YouTube channel exists
 *  
 *  @param {string} id The name of the channel's ID
 *  @param {number} index The index for an element (for injected.js)
 */
 function doesYoutubeExist(id, index){
	var channels = JSON.parse(localStorage.getItem("channels"));
	for(var i = 0; i < channels.length; i++){
		if(channels[i].id == id)
			return {status: true, index: index};
	}
	return {status: false, index: index};
}

/**
 *  Checks a specific YouTube channel
 *  
 *  @param {number} num The index of the YouTube channel (located in localStorage item: "channels"
 *  @param {boolean} [refresh=false] Refreshes the options page after execution
 *  @param {boolean} [batch=false] If the request is from a batch check (see function: checkYoutubeBatch)
 */
function checkYoutube(num, refresh, batch) {
	refresh = refresh || false;
	batch = batch || false;
	wyn.activeCheckings[num] = true;
	
	var channels = JSON.parse(localStorage.getItem("channels"));
	var url = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=5&playlistId=" + channels[num].playlistId + "&key=" + wyn.apiKey;
	//var url = "https://www.googleapis.com/youtube/v3/search?part=snippet&order=date&safeSearch=none&type=video&maxResults=1&channelId=" + channels[num].id + "&key=" + wyn.apiKey;//Old
	
	console.log(wyn.strings.notification_log_check + channels[num].name);
	$.ajax({
		url: url,
		error: function(data) {
			wyn.activeCheckings[num] = false;
			/*wyn.activeBatchCheckings[num] = false;
			for(var i = 0; i < wyn.activeBatchCheckings.length; i++)
				if(wyn.activeBatchCheckings[i])
					return;
			wyn.batchChecking = false;*/
		},
		success: function(data) {
			/*
			Why the use of playlistItems instead of search
			playlistItems = 3 quota
			search = 100 quota (33x more quota per request)
			*/
			
			data.items.sort(function(a, b){//START OF OLD
				var a = new Date(a.snippet.publishedAt),
					b = new Date(b.snippet.publishedAt);
				if(a > b) return -1;
				if(a < b) return 1;
				return 0;
			});//END OF OLD
			
			var videoId = data.items[0].snippet.resourceId.videoId,//OLD
			//var videoId = data.items[0].id.videoId,
				url = "https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&maxResults=1&id=" + videoId + "&key=" + wyn.apiKey,
				prevVideoId = channels[num].latestVideo.id,
				prevTimestamp = channels[num].latestVideo.timestamp;
			channels[num].latestVideo.id = videoId;
			channels[num].latestVideo.title = data.items[0].snippet.title;
			channels[num].latestVideo.description = data.items[0].snippet.description.substring(0,100).replace(/(\r\n|\n|\r)/gm," ");
			channels[num].latestVideo.timestamp = Date.parse(data.items[0].snippet.publishedAt)/1000;
			channels[num].latestVideo.thumbnail = data.items[0].snippet.thumbnails.high.url.replace("https:/", "http://");
			
			/*console.log("=====START OF " + channels[num].name + "=====");
			console.log("Previous Stamp: " + prevTimestamp);
			console.log("New Stamp: " + channels[num].latestVideo.timestamp);
			console.log("Previous ID: " + prevVideoId);
			console.log("New ID: " + channels[num].latestVideo.id);
			console.log("Change? " + (prevTimestamp >= channels[num].latestVideo.timestamp ? "true": "false"));
			console.log("=====END OF " + channels[num].name + "=====");*/
			
			if(prevTimestamp >= channels[num].latestVideo.timestamp){
				wyn.activeCheckings[num] = false;
				if(!batch){
					for(var i = 0; i < wyn.activeCheckings.length; i++)
						if(wyn.activeCheckings[i])
							return;
					if(refresh)
						chrome.extension.sendMessage({type: "refreshPage"});
					else
						chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.snackbar_nonewvideos});
				}/*else{
					wyn.activeBatchCheckings[num] = false;
					for(var i = 0; i < wyn.activeBatchCheckings.length; i++)
						if(wyn.activeBatchCheckings[i])
							return;
					wyn.batchChecking = false;
					if(wyn.hasBatchChanged){
						if(refresh)
							chrome.extension.sendMessage({type: "refreshPage"});
					}else
						chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.snackbar_nonewvideos});
				}*/
				return;
			}
			$.ajax({
				url: url,
				error: function(data) {
					wyn.activeCheckings[num] = false;
					/*wyn.activeBatchCheckings[num] = false;
					for(var i = 0; i < wyn.activeBatchCheckings.length; i++)
						if(wyn.activeBatchCheckings[i])
							return;
					wyn.batchChecking = false;*/
				},
				success: function(data) {
					channels[num].latestVideo.views = data.items[0].statistics.viewCount;
					channels[num].latestVideo.duration = convertISO8601Duration(data.items[0].contentDetails.duration);
					channels[num].latestVideo.likes = data.items[0].statistics.likeCount;
					channels[num].latestVideo.dislikes = data.items[0].statistics.dislikeCount;
					
					var channels2 = JSON.parse(localStorage.getItem("channels"));
					channels2[num] = channels[num];
					localStorage.setItem("channels", JSON.stringify(channels2));
					
					var info = channels[num];
					
					if(batch)
						wyn.hasBatchChanged = true;
					if(info.latestVideo.views == "301")
						info.latestVideo.views = "301+";
					info.latestVideo.likes = parseInt(info.latestVideo.likes);
					info.latestVideo.dislikes = parseInt(info.latestVideo.dislikes);
					var likesa = Math.round((info.latestVideo.likes / (info.latestVideo.likes + info.latestVideo.dislikes)) * 100);
					var dislikesa = Math.round((info.latestVideo.dislikes / (info.latestVideo.likes + info.latestVideo.dislikes)) * 100);
					if((likesa + dislikesa) > 100)
						dislikesa--;
					
					var options = {
						type: "image",
						priority: 0,
						title: info.latestVideo.title + " " + wyn.strings.info_by + " " + info.name,
						message: info.latestVideo.description,
						imageUrl: info.latestVideo.thumbnail,
						iconUrl: wyn.strings.notification_main_icon,
						contextMessage: info.latestVideo.duration + " | "+ addCommas(info.latestVideo.views) + " " + wyn.strings.info_views + " | " + likesa + "% " + wyn.strings.info_likes + " | " + dislikesa + "% " + wyn.strings.info_dislikes,
						buttons: [{
							title: wyn.strings.notification_watch,
							iconUrl: wyn.strings.notification_watch_icon
						}, {
							title: wyn.strings.notification_close,
							iconUrl: wyn.strings.notification_close_icon
						}]
					};
					var ntID = rndStr(10) + "-" + rndStr(5) + "-" + rndStr(5) + "-" + rndStr(5) + "-" + num;
					console.log(wyn.strings.log_color_prefix + wyn.strings.notification_log_new + info.name, wyn.strings.log_color_green);
					notify(ntID, options);
					
					wyn.activeCheckings[num] = false;
					if(!batch){
						for(var i = 0; i < wyn.activeCheckings.length; i++)
							if(wyn.activeCheckings[i])
								return;
						if(refresh)
							chrome.extension.sendMessage({type: "refreshPage"});
					}/*else{
						wyn.activeBatchCheckings[num] = false;
						for(var i = 0; i < wyn.activeBatchCheckings.length; i++)
							if(wyn.activeBatchCheckings[i])
								return;
						wyn.batchChecking = false;
						if(wyn.hasBatchChanged){
							if(refresh)
								chrome.extension.sendMessage({type: "refreshPage"});
						}else
							chrome.extension.sendMessage({type: "createSnackbar", message: wyn.strings.snackbar_nonewvideos});
					}*/
				}
			});
		}
	});
}

/**
 *  Converts an ISO-8601 formatted string to a different timestamp format (HH:MM:SS)
 *  
 *  @param {string} t The ISO-8601 formmated string
 *  @returns {string} Returns duration in HH:MM:SS format
 */
function convertISO8601Duration(t){ 
    //dividing period from time
    var x = t.split('T'),
        duration = '',
        time = {},
        period = {},
        //just shortcuts
        s = 'string',
        v = 'variables',
        l = 'letters',
        // store the information about ISO8601 duration format and the divided strings
        d = {
            period: {
                string: x[0].substring(1,x[0].length),
                len: 4,
                // years, months, weeks, days
                letters: ['Y', 'M', 'W', 'D'],
                variables: {}
            },
            time: {
                string: x[1],
                len: 3,
                // hours, minutes, seconds
                letters: ['H', 'M', 'S'],
                variables: {}
            }
        };
    //in case the duration is a multiple of one day
    if (!d.time.string) {
        d.time.string = '';
    }

    for (var i in d) {
        var len = d[i].len;
        for (var j = 0; j < len; j++) {
            d[i][s] = d[i][s].split(d[i][l][j]);
            if (d[i][s].length>1) {
                d[i][v][d[i][l][j]] = parseInt(d[i][s][0], 10);
                d[i][s] = d[i][s][1];
            } else {
                d[i][v][d[i][l][j]] = 0;
                d[i][s] = d[i][s][0];
            }
        }
    } 
    period = d.period.variables;
    time = d.time.variables;
    time.H +=   24 * period.D + 
                            24 * 7 * period.W +
                            24 * 7 * 4 * period.M + 
                            24 * 7 * 4 * 12 * period.Y;

    if (time.H) {
        duration = time.H + ':';
        if (time.M < 10) {
            time.M = '0' + time.M;
        }
    }

    if (time.S < 10) {
        time.S = '0' + time.S;
    }

    duration += time.M + ':' + time.S;
    return duration;
}

/**
 *  Checks all YouTube channels
 *  
 *  @param {boolean} [refresh=false] Refreshes the options page after execution
 */
function checkYoutubeBatch(refresh){
	refresh = refresh || false;
	
	if(wyn.batchChecking)
		return;
	//wyn.batchChecking = true;
	wyn.hasBatchChanged = false;
	
	console.log("Initializing YouTube channel check");
	var channels = JSON.parse(localStorage.getItem("channels"));
	for(var i = 0; i < channels.length; i++){
		setTimeout(function(i){// Debug timeout; Bug: Notifications not saving, repeated notifications; Assumption: Other channel updates overwriting
			//wyn.activeBatchCheckings[i] = true;
			checkYoutube(i, true, true);
		}, 100*i, i);
	}
}
wyn.forceRefresh = function(){checkYoutubeBatch(true)};

/**
 *  Add commas to numbers > 3
 *  Ex: 1234567 -> 1,234,567
 *  
 *  @param {number} num The number to add commas to
 *  @returns {string} Number inputted with commas
 */
function addCommas(num) {
	return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/**
 *  Creates a random alphanumberic string
 *  
 *  @param {number} len The length of the random string
 *  @returns {string} Random alphanumeric string
 */
function rndStr(len){
	var text = "";
	var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	for(var i = 0; i < len; i++)
		text += charset.charAt(Math.floor(Math.random() * charset.length));
	return text;
}

/**
 *  Creates a notification
 *  
 *  @param {string} ntID A random string used to identify the notification later
 *  @param {object} options Notification options (see: https://developer.chrome.com/apps/notifications#type-NotificationOptions)
 */
function notify(ntID, options){
	chrome.notifications.create(ntID, options, function(){
		/*var bc = localStorage.getItem("badgeCount");
		localStorage.setItem("badgeCount", ++bc);
		bc = localStorage.getItem("badgeCount");
		updateBadge({colour:'#e12a27', text:"" + bc});*/
		
		wyn.notificationSound.volume = parseInt(JSON.parse(localStorage.getItem("settings"))["notifications"]["volume"])/100;
		wyn.notificationSound.play()
		notifyTTS(options);
	});
}

/**
 *  Ran when a notification is clicked
 *  
 *  @param {string} ntID A random string used to identify the notification
 */
function onNotificationClick(ntID){
	if(typeof ntID.split("-")[4] !== "undefined") {
		var channels = JSON.parse(localStorage.getItem("channels"));
		createTab("https://www.youtube.com/watch?v=" + channels[ntID.split("-")[4]].latestVideo.id);
		console.log("User clicked on notification; NTID: " + ntID);
		console.log("Sending user to https://www.youtube.com/watch?v=" + channels[ntID.split("-")[4]].latestVideo.id);
	}
	chrome.notifications.clear(ntID);
}

/**
 *  Ran when a notification's buttons are clicked
 *  
 *  @param {string} ntID A random string used to identify the notification
 */
function onNotificationButtonClick(ntID, btnID){
	if(typeof ntID.split("-")[4] !== "undefined") {
		if(btnID == 0){
			var channels = JSON.parse(localStorage.getItem("channels"));
			createTab("https://www.youtube.com/watch?v=" + channels[ntID.split("-")[4]].latestVideo.id);
			console.log("User clicked on \"" + wyn.strings.notification_watch + "\" button; NTID: " + ntID);
			console.log("Sending user to https://www.youtube.com/watch?v=" + channels[ntID.split("-")[4]].latestVideo.id);
		}else if(btnID == 1){
			console.log("User clicked on \"" + wyn.strings.notification_close + "\" button; NTID: " + ntID);
		}
	}
	chrome.notifications.clear(ntID);
}

/**
 *  Ran when a notification is closed
 *  
 *  @param {string} ntID A random string used to identify the notification
 *  @param {boolean} byUser If the notification was closed by the user
 */
function onNotificationClosed(ntID, byUser){
	if(typeof ntID.split("-")[4] !== "undefined" && byUser)
		console.log("User clicked on \"X\" button; NTID: " + ntID);
}

/**
 *  Opens a link in a new tab/window
 *  
 *  @param {string} user The URL to open
 */
function createTab(url) {
	var numTabs = 0;
	chrome.windows.getAll(function(data){
		numTabs = data.length;
		if(numTabs > 0)
			chrome.tabs.create({url: url});
		else
			chrome.windows.create({url: url});
	});
}

/**
 *  Launches a test notification
 *  Can be launched in the option settings
 */
wyn.testNotify = function(){
	var ntID = rndStr(10) + "-" + rndStr(5) + "-" + rndStr(5) + "-" + rndStr(5);
	var options = {
		type: "image",
		priority: 0,
		title: "Video " + wyn.strings.info_by + " YouTube Creator",
		message: "Insert Description Here",
		imageUrl: "img/notification_placeholder.png",
		iconUrl: wyn.strings.notification_main_icon,
		contextMessage: "12:34 | 5,678 " + wyn.strings.info_views + " | 90% " + wyn.strings.info_likes + " | 10% " + wyn.strings.info_dislikes,
		buttons: [{
			title: wyn.strings.notification_watch,
			iconUrl: wyn.strings.notification_watch_icon
		}, {
			title: wyn.strings.notification_close,
			iconUrl: wyn.strings.notification_close_icon
		}]
	};
	
	notify(ntID, options);
}

/**
 *  Reads the notification's title if TTS is enabled in the settings
 *  
 *  @param {object} options Notification options (see: https://developer.chrome.com/apps/notifications#type-NotificationOptions)
 */
function notifyTTS(options) {
	if(JSON.parse(localStorage.getItem("settings")).tts.enabled){
		var voice = JSON.parse(localStorage.getItem("settings")).tts.type;
		var message = new SpeechSynthesisUtterance();
		message.voice = speechSynthesis.getVoices()[voice];
		var sList =  ["\\bEp\\b", "\\bEp.\\b", "\\bPt\\b", "\\bPt.\\b"];
		var sList2 = ["Episode", "Episode", "Part", "Part"];
		for(var i = 0; i < sList.length; i++)
			options.title = options.title.replace(new RegExp(sList[i], "g"), sList2[i]);
		message.text = options.title;
		speechSynthesis.speak(message);
	}
}

/**
 *  Forces a notification to be displayed
 *  
 *  @param {number} id The index of the video to be displayed
 */
wyn.forceNotification = function(id) {
	var info = JSON.parse(localStorage.getItem("channels"))[id];
	if(info.latestVideo.views == "301")
		info.latestVideo.views = "301+";
	info.latestVideo.likes = parseInt(info.latestVideo.likes);
	info.latestVideo.dislikes = parseInt(info.latestVideo.dislikes);
	var likesa = Math.round((info.latestVideo.likes / (info.latestVideo.likes + info.latestVideo.dislikes)) * 100);
	var dislikesa = Math.round((info.latestVideo.dislikes / (info.latestVideo.likes + info.latestVideo.dislikes)) * 100);
	if((likesa + dislikesa) > 100)
		dislikesa--;
	
	var options = {
		type: "image",
		priority: 0,
		title: info.latestVideo.title + " " + wyn.strings.info_by + " " + info.name,
		message: info.latestVideo.description,
		imageUrl: info.latestVideo.thumbnail,
		iconUrl: wyn.strings.notification_main_icon,
		contextMessage: info.latestVideo.duration + " | "+ addCommas(info.latestVideo.views) + " " + wyn.strings.info_views + " | " + likesa + "% " + wyn.strings.info_likes + " | " + dislikesa + "% " + wyn.strings.info_dislikes,
		buttons: [{
			title: wyn.strings.notification_watch,
			iconUrl: wyn.strings.notification_watch_icon
		}, {
			title: wyn.strings.notification_close,
			iconUrl: wyn.strings.notification_close_icon
		}]
	};
	var ntID = rndStr(10) + "-" + rndStr(5) + "-" + rndStr(5) + "-" + rndStr(5) + "-" + id;
	console.log(wyn.strings.log_color_prefix + wyn.strings.notification_log_new + info.name, wyn.strings.log_color_green);
	notify(ntID, options);
}

wyn.resetVideos = function(){
	var channels = JSON.parse(localStorage.getItem("channels"));
	for(var i = 0; i < channels.length; i++){
		channels[i].latestVideo.timestamp = 0;
	}
	localStorage.setItem("channels", JSON.stringify(channels));
}