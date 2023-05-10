const tts = require("./tts.js");
require("./main.css")

const API_PROJECT_ID = 'c9ecbbf6-9438-49cb-81e3-6daf18de5ddb';

const ttsPlugin = (project_key) => {
	tts(project_key);
}

module.exports = ttsPlugin;
