function parser(event) {
	var input = event.target;
	var reader = new FileReader();

	// define what happens during the fileread event
	reader.onload = (event) => {
		const file = event.target.result;
		const allLines = file.split(/\r\n|\n/);

		// store each line in the file in an array of strings
		var fileLines = [];

        // Reading line by line
        allLines.map((line) => {
        	fileLines.push(line);
        });

        // parse the actual ksh file
        processedData = parseKSH(fileLines);
        render(processedData[0], processedData[1]);
	}

	reader.onerror = (evt) => {console.log("File reading error occurred.");};

	// actually reads the file
	reader.readAsText(input.files[0]);

}

/*
Each object has several properties:
	beatStart = the beat that this object starts on
	beatEnd = the beat that this object ends on. For non-holds and non-lasers, this is equivalent to beatStart
	beatType = type of beat.
		0 is BT
		1 is long BT
		2 is FX
		3 is long FX
		4 is left laser
		5 is right laser
	lanePositionStart = the lane position that this beat should be in
	lanePositionEnd = the lane position that this object ends in. For non-holds and non-lasers, this is equal to lanePositionStart
	laserStart = used to indiciate that this object begins a new laser section.
	laserSegments = used for laser objects only, store all objects that make up each portion of the full laser

To read a KSH file: 
	Each line looks something like this: 0000|00|00
	The symbols represent BT1 BT2 BT3 BT4 | FXL FXR | LLaser RLaser
	For the BTs and FXs, a 0 means no note, 1 means chip note, and 2 means hold note.
	For Lasers, - means no laser, a symbol means there is a laser that changes or starts position here,
		meaning that there is a vertex for the line here. : means that the laser continues moving towards
		the end position from the defined start position

A few things to note:
	previousHolds is used in similar ways between BT/FX and Lasers. The first 6 previousHold indices represent
	BT1, BT2, BT3, BT4, FXL, FXR. These store the index of the beginning of a hold segment, so that upon the end
	of a hold note, the program knows where the original hold game object is in the objects list, and can update the 
	beatEnd property accordingly. If not in a hold section for the respective note type, the value is set to -1.
	THe last 2 previousHold indices represent LLaser and RLaser. These store the index of the previous laser section's
	index in the objects list, so that it's lanePositionEnd and beatEnd can be updated accordingly. Once again, if not 
	currently in a laser section for the respective laser, the value is set to -1.

	laserRanges is used to affect the lanePosition calculation of lasers - this applies to lasers that go off-screen, 
	since KSM has a flag which indicates when lasers should do this.

	When a laser start object is encountered (transition from -s to an actual letter in the laser column), the laser
	segments are stored in a laser_parts list (which consists of two lists - one for left laser and one for right laser).
	Laser segments are essentially one piece of the laser - meaning from one lanePositionStart to a lanePositionEnd, since
	lasers are all drawn as lines that cannot curve (curves are simulated with a lot of line segments). Once there are no 
	more laser segments for the current laser section, we create a parent laser object that stores the segments as
	a property (laserSegments), add the parent laser object to the main objects list, then clear the respective laser_parts
	list. This allows us to do more processing with lasers when rendering, since all segments that belong to one laser
	section are now grouped together.

*/
function parseKSH(fileLines) {

    // store all data objects in one conglomerate array (use d3 later to separate out)
	var objects = [];

	// store temporary laser objects before attaching them to one large laser object
	// i.e. - one laser object contains all subpieces that form the entire continuous laser
	// first element is for left laser, second element is for right laser
	var laser_parts = [[], []];

	var metadata = parseMetadata(fileLines);
	var beatsByLine = parseBeats(fileLines, metadata);

	var laserRanges = [1, 1];

	var previousHolds = [-1, -1, -1, -1, -1, -1, -1, -1]

	for (var lineIndex = metadata.chartStart; lineIndex < beatsByLine.length; lineIndex++) {
		var beatLine = beatsByLine[lineIndex];
		var line = beatLine.line;
		var beat = beatLine.beat;

		if (!line.startsWith("0") && !line.startsWith("1") && !line.startsWith("2")) { // non-beat lines
			if (line.startsWith("laserrange_r")) {
				laserRanges[1] = 2;
			} else if (line.startsWith("laserrange_l")) {
				laserRanges[0] = 2;
			}

		} else { // beat lines

			for (var i = 0; i < line.length; i++) {
				if (i == 4 || i == 7) { // invalid characters
					continue;
				} else if (i < 7) { // bts and fxs
					var fx = 0;
					if (i == 5 || i == 6) {
						fx = 1;
					}
					var value = +line.substr(i, 1);
					if (value == 1 + fx) { // chip BTs and FXs
						var btn = {};
						btn.beatStart = beat;
						btn.beatEnd = beat;
						btn.beatType = 0 + (fx * 2);
						btn.lanePositionStart = i - (fx * 5);
						btn.lanePositionEnd = i - (fx * 5);
						btn.laserStart = false;
						objects.push(btn);
					} else if (value == 2 - fx) { // for holds, initialize beatEnd to current beat, update later
						if (previousHolds[i - fx] == -1) {
							var longbtn = {};
							longbtn.beatStart = beat;
							longbtn.beatEnd = beat;
							longbtn.beatType = 1 + (fx * 2);
							longbtn.lanePositionStart = i - (fx * 5);
							longbtn.lanePositionEnd = i - (fx * 5);
							longbtn.laserStart = false;
							objects.push(longbtn);
							previousHolds[i - fx] = objects.length - 1;
						}
					} else if (value == 0) { // upon end of a hold, update beatEnd of the original hold object (created at beginning of hold) 
						if (previousHolds[i - fx] != -1) {
							objects[previousHolds[i - fx]].beatEnd = beat;
							previousHolds[i - fx] = -1;
						}
					}

				} else if (i < 10) { // lasers
					var value = line.substr(i, 1);
					var rightLaser = 0;

					// i (the position of the character currently being read in the line) is used to determine indicies of various elements
					// i - 2 is the index in previousHolds for the respective laser element (since previousHolds has BTs, FXs, and lasers as elements)
					// i - 8 is the index in laser_parts and laserRanges for the respective laser element (since these two only have lasers as elements)
					if (i == 9) {
						rightLaser = 1;
					}

					if (value !== "-" && value !== ":") {
						var laser = {};
						if (previousHolds[i - 2] == -1) { // if start of laser, deem it as laser start
							laser.laserStart = true;
						} else {
							// if not start of laser, update the previous laser's beatEnd and lanePositionEnd with this current vertex
							laser.laserStart = false;
							laser_parts[i-8][previousHolds[i - 2]].beatEnd = beat;
							laser_parts[i-8][previousHolds[i - 2]].lanePositionEnd = getNumericalLanePosition(value, laserRanges[i-8]);
						}
						if (beatsByLine[lineIndex+1].line.substr(i, 1) == "-") { // if laser doesn't continue from here, don't create a new laser segment from the end
							previousHolds[i - 2] = -1;
							laserRanges[i-8] = 1;

							// create the parent laser object to add the segments to
							// then add the parent laser object to the main objects list
							var last_index = laser_parts[i-8].length - 1;
							laser.beatStart = laser_parts[i-8][0].beatStart;
							laser.beatEnd = laser_parts[i-8][last_index].beatEnd;
							laser.beatType = 4 + rightLaser;
							laser.lanePositionStart = laser_parts[i-8][0].lanePositionStart;
							laser.lanePositionEnd = laser_parts[i-8][last_index].lanePositionEnd;
							laser.laserStart = true;
							laser.laserSegments = laser_parts[i-8];
							objects.push(laser);

							// clear the respective laser_parts list since this laser section is complete
							laser_parts[i-8] = [];
							continue;
						}

						// creates new laser segment from the end of current to some unknown point in time
						laser.beatStart = beat;
						laser.beatEnd = beat;
						laser.beatType = 4 + rightLaser;
						laser.lanePositionStart = getNumericalLanePosition(value, laserRanges[i-8]);
						laser.lanePositionEnd = getNumericalLanePosition(value, laserRanges[i-8]);
						laser_parts[i-8].push(laser);
						previousHolds[i - 2] = laser_parts[i-8].length - 1;
					}
				}
			}

		}
	}
	return [metadata, objects];
}

function parseMetadata(fileLines) {

	var metadataChecking = true;
	var metadataFields = ["title", "artist", "effect", "illustrator", "difficulty", "level", "t", "ver", "o"];
	var metadata = {};
	metadata.chartStart = fileLines.length;
	for (var lineIndex = 0; lineIndex < fileLines.length; lineIndex++) {
		var line = fileLines[lineIndex];

	    // METADATA Section
		if (metadataChecking) {
			for (var i = 0; i < metadataFields.length; i++) {
				if (line.startsWith(metadataFields[i] + '=')) {
					var index = line.indexOf('=') + 1;
					metadata[metadataFields[i]] = line.substr(index);
					break;
				}
			}
		}

		// Check if we have left the metadata section
		if (line.startsWith("--")) {
			metadata.chartStart = lineIndex;
			break;
		}

	}
	metadata.o = (+metadata.o);
	return metadata;
}

// actually read the ksh file and store it as a javascript list, throw out unrelated beat information
function parseBeats(fileLines, metadata) {

	var beats = [];
	var currentLength = -1;
	var sectionLength = 0;
	var sectionMultiplier = 0;
	var lastBeatIndex = 0;

	for (var lineIndex = 0; lineIndex < fileLines.length; lineIndex++) {
		var line = fileLines[lineIndex];

	    if (lineIndex < metadata.chartStart) { // all metadata has beat -1

	    	beats.push({
	    		line: line,
	    		beat: -1
	    	});
	    	lastBeatIndex++;

	    } else {
	    	if (line.startsWith("--")) { // process the measure's beat timing - currently hardcoded to only support 4/4 time and no BPM changes

				if (currentLength == -1) { // initial setup - skip the check
					currentLength = 0;
				} else {
					if (sectionLength == 0) { // invalid section length of 0 - prompt a .ksh file check by user
						console.log("Invalid section length of 0 occurred.");
					} else {
						var multiplier = 64 / sectionLength; // determine multiplier
						for (var i = lastBeatIndex; i < beats.length; i++) { // go through the list of objects created during this measure and give them their correct beats
							beats[i].beat = currentLength + (beats[i].beat * multiplier)
						}
					}
					currentLength = currentLength + 64;
					sectionLength = 0;
					lastBeatIndex = beats.length;
				}
				beats.push({
					line: line,
					beat: sectionLength
				});

			} else if (!line.startsWith("0") && !line.startsWith("1") && !line.startsWith("2") && !line.startsWith("--")) {
				beats.push({
					line: line,
					beat: sectionLength
				});
			} else {
				beats.push({
					line: line,
					beat: sectionLength
				});
				sectionLength++;
			}
	    }

	}

	return beats;

}

function getNumericalLanePosition(letter, laserRange) {
	var asciiValue = letter.charCodeAt(0);
	var position = null;
	if (asciiValue >= 48 && asciiValue <= 57) {
		position = (asciiValue - 48) / 50 * 5;
	} else if (asciiValue >= 65  && asciiValue <= 90) {
		position = (asciiValue - 55) / 50 * 5;
	} else if (asciiValue >= 97 && asciiValue <= 122) {
		position = (asciiValue - 97 + 36) / 50 * 5;
	} else {
		return null;
	}
	if (laserRange == 2) {
		return position = (position * 2) - 2.5;
	} else {
		return position;
	}
}
