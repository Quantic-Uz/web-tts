if (typeof responsiveVoice != 'undefined') {
	console.log('ResponsiveVoice already loaded');
	console.log(responsiveVoice);
} else {
	const ResponsiveVoice = function () {
		
		var self = this;
		
		// self.version = "1.3.8";
		// console.log("ResponsiveVoice r" + self.version);
		
		
		self.iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
		self.is_chrome = navigator.userAgent.indexOf('Chrome') > -1;
		self.is_safari = navigator.userAgent.indexOf("Safari") > -1;
		if ((self.is_chrome) && (self.is_safari)) {
			self.is_safari = false;
		}
		self.iOS_initialized = false;
		
		
		self.systemvoices;
		
		self.CHARACTER_LIMIT = 100;
		self.VOICESUPPORT_ATTEMPTLIMIT = 5;
		self.voicesupport_attempts = 0;
		self.fallbackMode = false;
		self.WORDS_PER_MINUTE = 140;
		
		
		self.isFinished = false;
		self.fallback_parts = null;
		self.fallback_part_index = 0;
		self.fallback_audio = null;
		self.fallback_playbackrate = 1;
		self.def_fallback_playbackrate = self.fallback_playbackrate;
		self.fallback_audiopool = [];
		self.msgparameters = null;
		self.timeoutId = null;
		self.OnLoad_callbacks = [];
		
		//Wait until system voices are ready and trigger the event OnVoiceReady
		if (typeof speechSynthesis != 'undefined') {
			speechSynthesis.onvoiceschanged = function () {
				
				self.systemvoices = window.speechSynthesis.getVoices();
				//console.log("OnVoiceReady - from onvoiceschanged");
				// console.log(self.OnVoiceReady);
				if (self.OnVoiceReady != null) {
					self.OnVoiceReady.call();
				}
			};
		}
		
		self.OnVoiceReady = null;
		
		
		self.init = function () {
			
			if (typeof speechSynthesis === 'undefined') {
				
				console.log('RV: Voice synthesis not supported');
				self.enableFallbackMode();
				
				
			} else {
				
				
				//Waiting a few ms before calling getVoices() fixes some issues with safari on IOS as well as Chrome
				setTimeout(function () {
					var gsvinterval = setInterval(function () {
						
						var v = window.speechSynthesis.getVoices();
						
						if (v.length == 0 && (self.systemvoices == null || self.systemvoices.length == 0)) {
							console.log('Voice support NOT ready');
							
							self.voicesupport_attempts++;
							if (self.voicesupport_attempts > self.VOICESUPPORT_ATTEMPTLIMIT) {
								
								clearInterval(gsvinterval);
								
								//On IOS, sometimes getVoices is just empty, but speech works. So we use a cached voice collection.
								if (window.speechSynthesis != null) {
									
									if (self.iOS) {
										
										console.log('RV: Voice support ready (cached)');
										self.systemVoicesReady(self.cache_ios_voices);
										
									} else {
										
										console.log("RV: speechSynthesis present but no system voices found");
										self.enableFallbackMode();
									}
									
								} else {
									
									//We don't support voices. Using fallback
									self.enableFallbackMode();
								}
							}
							
						} else {
							
							console.log('RV: Voice support ready');
							self.systemVoicesReady(v);
							
							clearInterval(gsvinterval);
							
						}
						
					}, 100);
				}, 100);
			}
			
			self.Dispatch("OnLoad");
		}
		
		self.systemVoicesReady = function (v) {
			self.systemvoices = v;
			
			
			if (self.OnVoiceReady != null)
				self.OnVoiceReady.call();
		}
		
		self.enableFallbackMode = function () {
			
			self.fallbackMode = true;
			console.log('RV: Enabling fallback mode');
			
			
			if (self.OnVoiceReady != null)
				self.OnVoiceReady.call();
			
			
		}
		
		
		self.speak = async function (text, voicename, parameters, project_id) {
			
			//Cancel previous speech if it's already playing
			if (self.isPlaying()) {
				self.cancel();
			}
			//Prevent fallbackmode to play more than 1 speech at the same time
			if (self.fallbackMode && self.fallback_audiopool.length > 0) {
				self.clearFallbackPool();
			}
			
			//Clean text
			// Quotes " and ` -> '
			text = text.replace(/[\"\`]/gm, "'");
			
			self.msgparameters = parameters || {};
			self.msgtext = text;
			self.msgvoicename = voicename;
			
			//Support for multipart text (there is a limit on characters)
			var multipartText = [];
			
			if (text.length > self.CHARACTER_LIMIT) {
				
				var tmptxt = text;
				
				while (tmptxt.length > self.CHARACTER_LIMIT) {
					
					//Split by common phrase delimiters
					var p = tmptxt.search(/[:!?.;]+/);
					var part = '';
					
					//Coludn't split by priority characters, try commas
					if (p == -1 || p >= self.CHARACTER_LIMIT) {
						p = tmptxt.search(/[,]+/);
					}
					
					//Couldn't split by normal characters, then we use spaces
					if (p == -1 || p >= self.CHARACTER_LIMIT) {
						
						var words = tmptxt.split(' ');
						
						for (var i = 0; i < words.length; i++) {
							
							if (part.length + words[i].length + 1 > self.CHARACTER_LIMIT)
								break;
							
							part += (i != 0 ? ' ' : '') + words[i];
							
						}
						
					} else {
						
						part = tmptxt.substr(0, p + 1);
						
					}
					
					tmptxt = tmptxt.substr(part.length, tmptxt.length - part.length);
					
					multipartText.push(part);
					//console.log(part.length + " - " + part);
					
				}
				
				//Add the remaining text
				if (tmptxt.length > 0) {
					multipartText.push(tmptxt);
				}
				
			} else {
				
				//Small text
				multipartText.push(text);
			}
			
			
			//Find system voice that matches voice name
			var rv;
			
			if (voicename == null) {
				rv = self.default_rv;
			} else {
				rv = self.getResponsiveVoice(voicename);
			}
			
			var profile = {};
			
			
			self.fallbackMode = true;
			self.fallback_parts = [];
			
			self.msgprofile = profile;
			console.log("Start multipart play");
			
			
			//new logic
			
			
			
			
			async function* audio_first () {
				let url_audio = null;
				
				for (let i=0; i<multipartText.length; i++) {
					const response = await fetch("https://dev.cabinet.tts.uz/api/v1/common/synthesize/", {
						body: JSON.stringify({
							text: multipartText[i],
							voice: "m",
							lang: "uz",
							project_id: project_id
						}),
						headers: {
							Accept: "application/json",
							Authorization: "token 4b014f299fb111b9572158fa94616ddd598cc8c0",
							"Content-Type": "application/json"
						},
						method: "POST"
					});
					const blob = await response.blob();
					url_audio = URL.createObjectURL(blob);
					
					yield url_audio;
				}
			}
			
			const runAudio = async () => {
				let index= 0;
				for await (const text of audio_first()) {
					const audio = document.createElement("AUDIO");
					audio.src = text;
					audio.playbackRate = 1;
					audio.preload = 'auto';
					audio.volume = 1; // 0 to 1;
					self.fallback_parts.push(audio);
					self.fallback_startPart();
					index++;
				}
			};
			
			runAudio();
			
			//Play multipart text

// 			for (let i = 0; i < multipartText.length; i++) {
//
// 				// await self.waitFor(1000);
// 				// console.log('ok ->', multipartText[i])
//
// 				if (! self.fallbackMode) {
// 					//Use SpeechSynthesis
//
// 					//Create msg object
// 					var msg = new SpeechSynthesisUtterance();
// 					msg.voice = profile.systemvoice;
// 					msg.voiceURI = profile.systemvoice.voiceURI;
// 					msg.volume = self.selectBest([profile.collectionvoice.volume, profile.systemvoice.volume, 1]); // 0 to 1
// 					msg.rate = self.selectBest([profile.collectionvoice.rate, profile.systemvoice.rate, 1]); // 0.1 to 10
// 					msg.pitch = self.selectBest([profile.collectionvoice.pitch, profile.systemvoice.pitch, 1]); //0 to 2*/
// 					msg.text = multipartText[i];
// 					msg.lang = self.selectBest([profile.collectionvoice.lang, profile.systemvoice.lang]);
// 					msg.rvIndex = i;
// 					msg.rvTotal = multipartText.length;
//
// 					if (i == 0) {
// 						msg.onstart = self.speech_onstart;
// 					}
// 					self.msgparameters.onendcalled = false;
//
// 					if (parameters != null) {
//
//
// 						if (i < multipartText.length - 1 && multipartText.length > 1) {
// 							msg.onend = parameters.onchunkend;
// 							msg.addEventListener('end', parameters.onchuckend);
// 						} else {
// 							msg.onend = self.speech_onend;
// 							msg.addEventListener('end', self.speech_onend);
// 						}
//
//
// 						msg.onerror = parameters.onerror || function (e) {
// 							console.log('RV: Unknow Error');
// 							console.log(e);
// 						};
//
// 						msg.onpause = parameters.onpause;
// 						msg.onresume = parameters.onresume;
// 						msg.onmark = parameters.onmark;
// 						msg.onboundary = parameters.onboundary;
// 						msg.pitch = parameters.pitch != null ? parameters.pitch : msg.pitch;
// 						if (self.iOS) {
// 							msg.rate = (parameters.rate != null ? (parameters.rate * parameters.rate) : 1) * msg.rate;
// 						} else {
// 							msg.rate = (parameters.rate != null ? parameters.rate : 1) * msg.rate;
// 						}
//
// 						msg.volume = parameters.volume != null ? parameters.volume : msg.volume;
//
//
// 					} else {
// 						msg.onend = self.speech_onend;
// 						msg.onerror = function (e) {
// 							console.log('RV: Unknow Error');
// 							console.log(e);
// 						};
// 					}
// 					console.log("msg", msg);
// 					//setTimeout(function(){
// 					speechSynthesis.speak(msg);
// 					//},0);
//
// 				} else {
// 					console.log('ok else');
// 					// self.fallback_playbackrate = self.def_fallback_playbackrate;
//
// 					// var pitch = self.selectBest([profile.collectionvoice.pitch, profile.systemvoice.pitch, 1]) //0 to 2*/
// 					// var rate = self.selectBest([profile.collectionvoice.rate, profile.systemvoice.rate, 1]); // 0.1 to 10
// 					// var volume = self.selectBest([profile.collectionvoice.volume, profile.systemvoice.volume, 1]); // 0 to 1
//
// 					// if (parameters != null) {
// 					//     pitch = (parameters.pitch != null ? parameters.pitch : 1) * pitch;
// 					//     rate = (parameters.rate != null ? parameters.rate : 1) * rate;
// 					//     volume = (parameters.volume != null ? parameters.volume : 1) * volume;
// 					// }
// 					// pitch /= 2;
// 					// rate /= 2;
// 					// volume *= 2;
// 					// pitch = Math.min(Math.max(pitch, 0), 1);
// 					// rate = Math.min(Math.max(rate, 0), 1);
// 					// volume = Math.min(Math.max(volume, 0), 1);
// 					//console.log(volume);
// 					//self.fallback_playbackrate = pitch;
//
// 					// var url = 'http://code.responsivevoice.org/' + self.tstCompiled()?'':'develop/'
// 					//         + 'getvoice.php'
// 					//         + '?t=' + multipartText[i]
// 					//         + '&tl=' + (profile.collectionvoice.lang || profile.systemvoice.lang || 'en-US')
// 					//         + '&sv=' + (profile.collectionvoice.service || profile.systemvoice.service || '')
// 					//         + '&vn=' + (profile.collectionvoice.voicename || profile.systemvoice.voicename || '')
// 					//         + '&pitch=' + pitch.toString()
// 					//         + '&rate=' + rate.toString()
// 					//         + '&vol=' + volume.toString()
// 					//         ;
//
// 					// var url = "https://cabinet.quantic.uz/api/v1/cabinet/synthesize/?t=" + multipartText[i];
//
// // 					let url_audio = null;
// //
// // 					const usePlugin = async (selected_text = multipartText[i]) => {
// // 						const response = await fetch("https://dev.cabinet.tts.uz/api/v1/common/synthesize/", {
// // 							body: JSON.stringify({
// // 								text: selected_text,
// // 								voice: "m",
// // 								lang: "uz",
// // 								project_id: "c9ecbbf6-9438-49cb-81e3-6daf18de5ddb"
// // 							}),
// // 							headers: {
// // 								Accept: "application/json",
// // 								Authorization: "token 4b014f299fb111b9572158fa94616ddd598cc8c0",
// // 								"Content-Type": "application/json"
// // 							},
// // 							method: "POST"
// // 						});
// // 						const blob = await response.blob();
// // 						url_audio = URL.createObjectURL(blob);
// // 						console.log(url_audio);
// // 					}
// // 					const useAudio = () => {
// //
// // 						    usePlugin().then(() => {
// // 							    const audio = document.createElement("AUDIO");
// // 							    audio.src = url_audio;
// // 							    audio.playbackRate = 1;
// // 							    audio.preload = 'auto';
// // 							    audio.volume = 1; // 0 to 1;
// // 							    self.fallback_parts.push(audio);
// // 						    }).finally(() => {
// // 							    // self.fallback_startPart();
// // 						    });
// // ;					}
// //
// // 					useAudio();
// 				}
//
//
// 			}
			
			
			if (self.fallbackMode) {
				self.fallback_part_index = 0;
				self.fallback_startPart();
				
			}
			
		}
		
		self.startTimeout = function (text, callback) {
			
			//if (self.iOS) {
			//   multiplier = 0.5;
			//}
			
			var multiplier = self.msgprofile.collectionvoice.timerSpeed;
			if (self.msgprofile.collectionvoice.timerSpeed == null)
				multiplier = 1;
			
			//console.log(self.msgprofile.collectionvoice.name);
			if (multiplier <= 0)
				return;
			
			self.timeoutId = setTimeout(callback, multiplier * 1000 * (60 / self.WORDS_PER_MINUTE) * text.split(/\s+/).length); //avg 140 words per minute read time
			//console.log("Timeout " + self.timeoutId + " started: " + (multiplier * 1000 * (60 / self.WORDS_PER_MINUTE) * text.split(/\s+/).length).toString());
		}
		
		self.checkAndCancelTimeout = function () {
			if (self.timeoutId != null) {
				//console.log("Timeout " + self.timeoutId + " cancelled");
				clearTimeout(self.timeoutId);
				self.timeoutId = null;
			}
		}
		
		self.speech_timedout = function () {
			//console.log("Speech cancelled: Timeout " + self.timeoutId + " ended");
			self.cancel();
			self.cancelled = false;
			//if (!self.iOS) //On iOS, cancel calls msg.onend
			self.speech_onend();
			
		}
		
		self.speech_onend = function () {
			self.checkAndCancelTimeout();
			
			//Avoid this being automatically called just after calling speechSynthesis.cancel
			if (self.cancelled === true) {
				self.cancelled = false;
				return;
			}
			
			//console.log("on end fired");
			if (self.msgparameters != null && self.msgparameters.onend != null && self.msgparameters.onendcalled != true) {
				//console.log("Speech on end called  -" + self.msgtext);
				self.msgparameters.onendcalled = true;
				self.msgparameters.onend();
				
			}
			
		}
		
		self.speech_onstart = function () {
			//if (!self.iOS)
			//console.log("Speech start");
			if (self.iOS || self.is_safari)
				self.startTimeout(self.msgtext, self.speech_timedout);
			
			self.msgparameters.onendcalled = false;
			if (self.msgparameters != null && self.msgparameters.onstart != null) {
				self.msgparameters.onstart();
			}
			
		}
		
		self.waitFor = function (millisec) {
			return new Promise(resolve => {
				setTimeout(() => { resolve('') }, millisec);
			});
		}
		
		
		self.fallback_startPart =  function () {
			
			if (self.fallback_part_index == 0) {
				self.speech_onstart();
			}
			
			self.fallback_audio = self.fallback_parts[self.fallback_part_index];
			
			if (self.fallback_audio == null) {
				
				//Fallback audio is not working. Just wait for the timeout event
				console.log("RV: Fallback Audio is not available");
				
			} else {
				
				console.log('finish work')
				
				var audio = self.fallback_audio;
				
				//Add to pool to prevent multiple streams to be played at the same time
				self.fallback_audiopool.push(audio);
				
				setTimeout(function () {
					audio.playbackRate = self.fallback_playbackrate;
				}, 50)
				audio.onloadedmetadata = function () {
					audio.play();
					audio.playbackRate = self.fallback_playbackrate;
				}
				self.fallback_audio.play();
				self.fallback_audio.addEventListener('ended', self.fallback_finishPart);
			}
		}
		
		self.fallback_finishPart = function (e) {
			
			self.checkAndCancelTimeout();
			
			if (self.fallback_part_index < self.fallback_parts.length - 1) {
				//console.log('chunk ended');
				self.fallback_part_index++;
				self.fallback_startPart();
				
			} else {
				//console.log('msg ended');
				self.speech_onend();
				
			}
			
		}
		
		
		self.cancel = function () {
			
			self.checkAndCancelTimeout();
			
			if (self.fallbackMode) {
				if (self.fallback_audio != null)
					self.fallback_audio.pause();
				self.clearFallbackPool();
			} else {
				self.cancelled = true;
				speechSynthesis.cancel();
				
			}
		}
		
		
		self.voiceSupport = function () {
			
			return ('speechSynthesis' in window);
			
		}
		
		self.OnFinishedPlaying = function (event) {
			//console.log("OnFinishedPlaying");
			if (self.msgparameters != null) {
				if (self.msgparameters.onend != null)
					self.msgparameters.onend();
			}
			
		}
		
		//Set default voice to use when no voice name is supplied to speak()
		self.setDefaultVoice = function (voicename) {
			
			var rv = self.getResponsiveVoice(voicename);
			
			if (rv != null) {
				self.default_rv = rv;
			}
			
		}
		
		
		//Look for the voice in the system that matches the one in our collection
		self.getMatchedVoice = function (rv) {
			
			for (var i = 0; i < rv.voiceIDs.length; i++) {
				var v = self.getSystemVoice(self.voicecollection[rv.voiceIDs[i]].name);
				if (v != null)
					return v;
			}
			
			return null;
			
		}
		
		self.getSystemVoice = function (name) {
			
			if (typeof self.systemvoices === 'undefined' || self.systemvoices === null)
				return null;
			
			for (var i = 0; i < self.systemvoices.length; i++) {
				if (self.systemvoices[i].name == name)
					return self.systemvoices[i];
			}
			
			return null;
			
		}
		
		
		self.Dispatch = function (name) {
			
			if (self.hasOwnProperty(name + "_callbacks") &&
				self[name + "_callbacks"].length > 0) {
				var callbacks = self[name + "_callbacks"];
				for (var i = 0; i < callbacks.length; i++) {
					callbacks[i]();
				}
				
			}
		}
		
		self.AddEventListener = function (name, callback) {
			if (self.hasOwnProperty(name + "_callbacks")) {
				self[name + "_callbacks"].push(callback);
			} else {
				console.log("RV: Event listener not found: " + name);
			}
		}
		
		
		//Event to initialize speak on iOS
		self.clickEvent = function () {
			if (self.iOS && ! self.iOS_initialized) {
				self.speak(" ");
				self.iOS_initialized = true;
			}
		}
		
		
		self.isPlaying = function () {
			if (self.fallbackMode) {
				
				return (self.fallback_audio != null &&
					! self.fallback_audio.ended &&
					! self.fallback_audio.paused);
				
			} else {
				
				return speechSynthesis.speaking;
				
			}
		}
		
		self.clearFallbackPool = function () {
			
			for (var i = 0; i < self.fallback_audiopool.length; i++) {
				
				if (self.fallback_audiopool[i] != null) {
					self.fallback_audiopool[i].pause();
					self.fallback_audiopool[i].src = '';
					//self.fallback_audiopool[i].parentElement.removeChild(self.fallback_audiopool[i]);
				}
			}
			self.fallback_audiopool = [];
		}
		
		
		document.addEventListener('DOMContentLoaded', function () {
			self.init();
		});
		
		
		self.tstCompiled = function (xy) {
			xy = 0;
			return eval("typeof x" + "y === 'undefined'");
		}
		
		self.selectBest = function (a) {
			
			for (var i = 0; i < a.length; i++) {
				if (a[i] != null) return a[i];
			}
			return null;
		}
		
	}
	var responsiveVoice = new ResponsiveVoice();
}

const createIcon = () => {
	const icon_template = document.createElement('template');
	const icon_img = document.createElement('span');
	icon_img.id = 'control_tts';
	icon_template.id = 'icon_template'
	icon_template.appendChild(icon_img);
	
	return icon_template;
}

const tts = (project_id) => {
	const body = document.querySelector('body');
	body.style.position = 'relative';
	body.appendChild(createIcon());
	
	
	const control = document.getElementById('icon_template');
	
    control.addEventListener('pointerup', oncontroldown, true);
	
	document.querySelector("body").onpointerup = (event) => {
		let selection = document.getSelection(),
		text = selection.toString();
		if (text.trim() !== "" && text.length !== 1) {
			

			
			let rect = selection
				.getRangeAt(0)
				.getBoundingClientRect();
			
			const x = event.pageX;
			const y = event.pageY;
			
			control.style.display= 'block';
			control.style.position = 'absolute'
			control.style.top = `${y - 28}px`;
			control.style.left = `${x + 10}px`;
			control.style.zIndex = 10;
			
			control["text"] = text;
			document.body.appendChild(control);
			control.style.display = 'block';
			
		}else {
			control.remove();
		}
	};
	function oncontroldown(event) {
		responsiveVoice.speak(this.text,undefined,undefined, project_id);
		this.remove();
		document.getSelection().removeAllRanges();
		event.stopPropagation();
	}
	document.onpointerdown = () => {
		let control = document.querySelector('#control');
		if (control !== null) {
			control.remove();
			document.getSelection().removeAllRanges();
		}
	}
}

module.exports = tts;

