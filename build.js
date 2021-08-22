#!/usr/bin/env node

"use strict";

const fsPromises = require("fs").promises || require("fs/promises");

const startLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
const startLettersLength = startLetters.length | 0;
const middleLetters = "0123456789" + startLetters;
const middleLettersLength = middleLetters.length | 0;

const hasProp = hasOwnProperty;

const PRIMARY_LANGUAGE = "en"; // english

const WEBSITE_URL = "";

var lastLineNumber = 0;
var currentLineNumber = 0;
const resolvedPromise = Promise.resolve();

function writeToNthLine(n, text) {
	var toWriteOut = "\r\x1B[K" + text;
	if (n < currentLineNumber) {
		toWriteOut = "\x1B[" + (currentLineNumber - n) + "B" + toWriteOut;
	} else if (currentLineNumber < n) {
		toWriteOut = "\x1B[" + (n - currentLineNumber) + "A" + toWriteOut;
	}

	currentLineNumber += text.split("\n").length;

	if (lastLineNumber < currentLineNumber) lastLineNumber = currentLineNumber;
	
	if (process.stdout.write(toWriteOut)) {
		return resolvedPromise;
	} else {
		return new Promise(resolve => process.stdout.once('drain', resolve));
	}
}

class LineWriter {
	constructor() {
		this.line = lastLineNumber;
	}
	writeText(text) {
		return writeToNthLine(this.line, text);
	}
}

async function verboseReadFile(path) {
	const writer = new LineWriter;
	await writer.writeText("Reading " + path + "...");
	
	const content = await fsPromises.readFile(path, "utf-8");
	
	await writer.writeText("Finished reading " + content.length + " bytes from " + path + "\n");
	return content;
}
async function verboseReadDirectory(path) {
	const writer = new LineWriter;
	await writer.writeText("Listing " + path + "/...");
	
	const content = await fsPromises.readdir(path, "utf-8");
	
	await writer.writeText("Finished listing " + content.length + " files in " + path + "/\n");
	return content;
}
async function verboseWriteFile(path, data) {
	const writer = new LineWriter;
	await writer.writeText("Writing " + path + "...");
	
	await fsPromises.writeFile(path, data);
	
	await writer.writeText("Finished writing " + data.length + " bytes to " + path + "\n");
}
async function verboseMakeDirectory(path) {
	const writer = new LineWriter;
	await writer.writeText("Making directory " + path + "/...");
	
	await fsPromises.mkdir(path, {recursive: true});
	
	await writer.writeText("Finished making directory " + path + "\n");
}

(async function() {
	// Note that the languages we translate to is not based upon internet user traffic but rather based upon https://meta.wikimedia.org/wiki/List_of_Wikipedias_by_speakers_per_article for two reasons:
	//  1. Wikipedia excellently factors in the multilingual bias, whereby a language that is commonly paired with another language in bilingual people is less liukely to be translated to as there's less need
	//  2. Wikipedia users and authors tend to browse the internet and tend not be the sort of people who only use the internet to access a few essential websites, which is closer to our target audience.
	const readLanguagesDirectoryPromise = verboseReadDirectory("translations");
	
	const filesList = ["index.html"];
	
	const fileContents = await verboseReadFile( "index.src.html" );
	
	const wordFrequencies = Object.create(null);
	
	const NAMEregex = /NAME_[\w_$]+/g;
	
	fileContents.replace(NAMEregex, function(match) {
		wordFrequencies[match.substring("NAME_".length)] = (wordFrequencies[match]|0) + 1 | 0;
		
		return match; // so that string isn't modified
	});
	NAMEregex.lastIndex = 0;
	
	const wordsWithIDEntries = Object.entries(wordFrequencies).sort(function(a, b) {
		// Sort from most frequent to least frequent
		// This sort is very stable because it ensures that no two entries will ever be considered equal
		return ((b[1]|0) - (a[1]|0) | 0) || (a[0] > b[0] | 0) || -1;//-(a[0] < b[0] | 0);
	});
	for (let i=0, len=wordsWithIDEntries.length|0; i < len; i=i+1|0) {
		let endString = "", curAcc = i | 0;
		
		while (middleLettersLength < curAcc) {
			endString += middleLetters[curAcc % middleLettersLength];
			curAcc = curAcc / middleLettersLength | 0;
		}
		
		let stop = i + startLettersLength;
		if (len < stop) stop = len;
		
		for (let cur=0; i < stop; cur=cur+1|0) {
			wordsWithIDEntries[i][1] = startLetters[cur] + endString;
			i = i + 1 | 0;
		}
	}
	
	const wordsWithIDHashMap = Object.fromEntries(wordsWithIDEntries);
	
	wordsWithIDEntries.length = 0; // free memory
	
	
	const allSupportedLanguages = [];
	
	(await readLanguagesDirectoryPromise).forEach(function(fileName) {
		fileName.replace(/^(.+)\.json$/, function(_, language) {
			allSupportedLanguages.push( language );
		});
	});

	if ("LANG_SPACE_SEP_LIST" in wordsWithIDHashMap) wordsWithIDHashMap["LANG_SPACE_SEP_LIST"] = allSupportedLanguages.join(" "); // NAME_LANG_SPACE_SEP_LIST
	if ("LANG_BAR_SEP_LIST" in wordsWithIDHashMap) wordsWithIDHashMap["LANG_BAR_SEP_LIST"] = allSupportedLanguages.join("|"); // NAME_LANG_BAR_SEP_LIST
	if ("PRIMARY_LANGUAGE" in wordsWithIDHashMap) wordsWithIDHashMap["PRIMARY_LANGUAGE"] = PRIMARY_LANGUAGE; // NAME_PRIMARY_LANGUAGE
	if ("PAGE_LANGUAGE" in wordsWithIDHashMap) wordsWithIDHashMap["PAGE_LANGUAGE"] = "LANG_PAGE_LANGUAGE"; // NAME_PAGE_LANGUAGE
	if ("NULL_EMPTY_TEXT" in wordsWithIDHashMap) wordsWithIDHashMap["NULL_EMPTY_TEXT"] = "LANG_NULL_EMPTY_TEXT"; // NAME_NULL_EMPTY_TEXT
	//if ("EMPTY_PLAIN_DIV" in wordsWithIDHashMap) wordsWithIDHashMap["EMPTY_PLAIN_DIV"] = "LANG_EMPTY_PLAIN_DIV"; // NAME_EMPTY_PLAIN_DIV
	// now, substitue the words back into the mix-mash
	/*await Promise.all(
		Object.entries(fileNamesAndContent).map(function(entry) {
			return new Promise(function(resolve, reject) {
				setImmediate(function() {
					var contents = entry[1];
					entry[1] = "";
					contents = contents.replace(NAMEregex, function(match) {
						return wordsWithIDHashMap[match.substring("NAME_".length)];
					});
					fsPromises.writeFile(entry[0], contents).then(resolve, reject);
					contents = "";
				});
			});
		})
	);*/
	function replaceNAMEentry(match) {
		return wordsWithIDHashMap[match.substring("NAME_".length)];
	}
	const replacedContents = fileContents.replace(NAMEregex, replaceNAMEentry);
	
	const minifiedContents = require('html-minifier').minify(replacedContents, {
		"caseSensitive": false,
		"collapseBooleanAttributes": true,
		"collapseInlineTagWhitespace": false,
		"collapseWhitespace": true,
		"conservativeCollapse": false,
		"continueOnParseError": true,
		"decodeEntities": true,
		"html5": true,
		"includeAutoGeneratedTags": false,
		"keepClosingSlash": false,
		"maxLineLength": 0,
		"minifyCSS": true,
		"minifyJS": true,
		"minifyURLs": false,
		"preserveLineBreaks": false,
		"preventAttributesEscaping": false,
		"removeAttributeQuotes": true,
		"removeComments": true,
		"removeEmptyAttributes": true,
		"removeEmptyElements": true,
		"removeOptionalTags": false, // removes html, head, and body, which I am not sure if it 
		"removeRedundantAttributes": true,
		"removeScriptTypeAttributes": true,
		"removeStyleLinkTypeAttributes": true,
		"removeTagWhitespace": true,
		"sortAttributes": true,
		"sortClassName": true,
		"trimCustomFragments": true,
		"useShortDoctype": false // this option is broken
	}).replace(/\[:SPACE:\]/g, " ");

	const pendingTranslatePromises = [];

	var errorsToOutput = [];

	for (const language of allSupportedLanguages) {
		const outputDirectory = "gh-pages" + (language === PRIMARY_LANGUAGE ? "" : "/" + language)
		
		const mkDirPromise = verboseMakeDirectory( outputDirectory );
		
		pendingTranslatePromises.push( mkDirPromise );
		
		pendingTranslatePromises.push(
			verboseReadFile("translations/" + language + ".json")
			.then(JSON.parse)
			.then(async function(transTexts) {
				await mkDirPromise;
				
				transTexts["PAGE_LANGUAGE"] = language;
				transTexts["NULL_EMPTY_TEXT"] = "";
				//transTexts["EMPTY_PLAIN_DIV"] = "<div></div>";
				
				await verboseWriteFile(
					outputDirectory + "/index.html",
					minifiedContents.replace(/LANG_([a-zA-Z\d_]*)(?:\\ )?/g, function(_, name) {
						if (!hasProp.call(transTexts, name) || typeof transTexts[name] !== "string") {
							errorsToOutput.push("ERR: no translation exists for " + _ + " in " + language + ".json");
							return _;
						}
						return transTexts[name];
					})
				);
			})
		);
	}
	
	try {
		await Promise.all(pendingTranslatePromises);
	} finally {
		if (errorsToOutput.length) {
			console.error( errorsToOutput.join("\n") );
		}
	}
})();

