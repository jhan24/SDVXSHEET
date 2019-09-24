var left = 350;
var width = 50;
var right = 650;
var top = 100;
var bottom = 900;
var padding = 5;
var spacing = 17;
var btnHeight = 10;

// render variables
var songInformation = {};
var song;
var groupedBeats;

// game variables
var laneBeats;
var lanes = ['bt1', 'bt2', 'bt3', 'bt4', 'fxl', 'fxr', 'll', 'rl'];
var laneIndexes = [0, 0, 0, 0, 0, 0, 0, 0];
var slamIndexes = [0, 0];
var globalTimer;
var keysHit = [0, 0, 0, 0, 0, 0, 0, 0]; // used for BTs and FXs only, include lasers for consistency only
var keysUp = [0, 0, 0, 0, 0, 0, 0, 0]; // used for BTs and FXs only, include lasers for consistency only
var holdDown = [0, 0, 0, 0, 0, 0, 0, 0]; // used for BTs and FXs only, include lasers for consistency only
var prevHoldTick = [-1, -1, -1, -1, -1, -1, -1, -1]; // [BT1, BT2, BT3, BT4, FXL, FXR, LL, RL]
var frameLength = 30; // length of frame in milliseconds
var heightPerFrame; // amount of height traversed per frame
var tickRate; // tick rate (combo up) of hold notes (as height position)
var guessedHeight = 0;
var gracePeriod = [1, 1] // each laser has some frames of grace period
var pointerPositions = [0, 5];
var slamProcessed = [0, 0];
var laserHitIndex = [0, 0];
var laserHit = [0, 0];
var slamHeightSuccess = [0, 0];

// mouse variables
var mousePosition = [0, 0]; // [deltaX, deltaY]
var mouseTimestamp = 0;
var oldTimestamp = -1;

function setEqualHeight(e) {
	var w = window.innerWidth;
	var h = window.innerHeight;
	console.log(h);
	var ratio = 0;
	if (h < 750) {
		var ratio = h / 750.0;
		d3.select('.viewbox').attr('height', 750 * ratio);
		d3.select('.viewbox').attr('width', 400 * ratio);
	} else if (h >= 750 && h < 1050) {
		d3.select('.viewbox').attr('height', 750);
		d3.select('.viewbox').attr('width', 400);
	} else {
		var newHeight = 750 + Math.floor(Math.sqrt(h - 1050) * 2)
		var ratio = newHeight / 750;
		d3.select('.viewbox').attr('height', 750 * ratio);
		d3.select('.viewbox').attr('width', 400 * ratio);
	}
}

// adds a listener to the button that locks the pointer when play is pressed
window.onload=function() {
	document.getElementById('playbutton').addEventListener("click", function() {
		if (document.pointerLockElement == null) { // if no currently active pointer lock, lock the pointer
			this.requestPointerLock();
			document.addEventListener("mousemove", updateMousePosition, false);
		} 
	});
	window.addEventListener('resize', setEqualHeight);
	setEqualHeight(0);
}

function render(metadata, beats) {
	console.log(metadata);
	console.log(beats);

	// clears any previously drawn tracks (deletes the parent objects entirely)
	if (document.getElementsByClassName('notes').length > 0) {
		document.getElementsByClassName('notes')[0].remove();
	}

	var canvas = d3.select(".parent_notes").append('g').attr('class', 'notes').attr('transform', 'translate(0, 0)');

	var maxBeat = d3.max(beats, function(d) {
		return d.beatEnd;
	});

	groupedBeats = d3.nest()
  		.key(function(d) { return d.beatType; })
  	.entries(beats);

  	var keyOrder = [6, 2, 5, 1, 4, 3]
	groupedBeats.sort(function(a, b) {
		if (keyOrder[+a.key] < keyOrder[b.key]) return -1;
		if (keyOrder[+a.key] > keyOrder[b.key]) return 1;
		return 0;
	});

	songInformation['maxBeat'] = maxBeat;
	songInformation['metadata'] = metadata;

  	var noteG = canvas.selectAll('.noteType')
		.data(groupedBeats)
		.enter()
		.append('g')
		.attr('class', 'noteType')
		.attr('id', function(d) {
			return 'noteType' + d.values[0].beatType;
		});

	createNotes();

	// process beats for gameplay here
	laneBeats = {
		bt1: [],
		bt2: [],
		bt3: [],
		bt4: [],
		fxl: [],
		fxr: [],
		ll: [],
		rl: []
	}

	for (var i = 0; i < beats.length; i++) {
		var b = beats[i];
		if ((b.beatType == 0 || b.beatType == 1) && b.lanePositionStart == 0) {
			laneBeats['bt1'].push(beats[i]);
		} else if ((b.beatType == 0 || b.beatType == 1) && b.lanePositionStart == 1) {
			laneBeats['bt2'].push(beats[i]);
		} else if ((b.beatType == 0 || b.beatType == 1) && b.lanePositionStart == 2) {
			laneBeats['bt3'].push(beats[i]);
		} else if ((b.beatType == 0 || b.beatType == 1) && b.lanePositionStart == 3) {
			laneBeats['bt4'].push(beats[i]);
		} else if ((b.beatType == 2 || b.beatType == 3) && b.lanePositionStart == 0) {
			laneBeats['fxl'].push(beats[i]);
		} else if ((b.beatType == 2 || b.beatType == 3) && b.lanePositionStart == 1) {
			laneBeats['fxr'].push(beats[i]);
		} else if (b.beatType == 4) {
			var laserSegments = beats[i].laserSegments;
			for (var ls = 0; ls < laserSegments.length; ls++) {
				laneBeats['ll'].push(laserSegments[ls]);
				laneBeats['ll'][laneBeats['ll'].length - 1].beatStartSegment = beats[i].beatStart; // add the start of the laser segment so we can refer to the proper laser element on-screen to change opacity when hit
			}
		} else if (b.beatType == 5) {
			var laserSegments = beats[i].laserSegments;
			for (var ls = 0; ls < laserSegments.length; ls++) {
				laneBeats['rl'].push(laserSegments[ls]);
				laneBeats['rl'][laneBeats['rl'].length - 1].beatStartSegment = beats[i].beatStart;
			}
		}
	}
	console.log(laneBeats);
}

function createNotes() {
	noteG = d3.selectAll('.noteType');
	var notes = noteG.selectAll('.notes').data(function(d) {
		return d.values;
	}, function(d) {
		return d.beatStart + d.beatType + d.lanePositionStart;
	});

	// create any new notes
	var notesEnter = notes.enter()
		.append("polygon")
		.attr("class", function(d) {
			if (d.beatType == 0) {
				return "notes btn";
			} else if (d.beatType == 1) {
				return "notes longbtn long" + d.lanePositionStart + "time" + Math.round(d.beatStart);
			} else if (d.beatType == 2) {
				return "notes fx";
			} else if (d.beatType == 3) {
				return "notes longfx long" + (d.lanePositionStart + 4) + "time" + Math.round(d.beatStart);
			} else if (d.beatType == 4) {
				return "notes laser lLaser laser6" + 'time' + Math.round(d.beatStart);
			} else if (d.beatType == 5) {
				return "notes laser rLaser laser7" + 'time' + Math.round(d.beatStart);
			}
		})
		.style("fill", function(d) {
			if (d.beatType == 0 || d.beatType == 1) {
				return "#FFFFFF";
			} else if (d.beatType == 2 || d.beatType == 3) {
				return "#E1941B";
			} else if (d.beatType == 4) {
				return "#0ADCFF";
			} else if (d.beatType == 5) {
				return "#EB51CE";
			}
		})
		.attr('opacity', function(d) {
			if (d.beatType == 1) {
				return 0.6;
			} else if (d.beatType >= 3) {
				return 0.50;
			} else {
				return 1;
			}
		})
		.attr('beatTime', function(d) {
			return d.beatStart;
		})
		.attr('lanePosition', function(d) {
			return d.lanePositionStart;
		})
		.attr('transform', 'translate(0, 0)');

	// update the position of all notes with the current spacing amount
	notes.merge(notesEnter).attr("points", function(d) {
			return drawBeats(d);
		})

	// clears any previously drawn measure lines
	if (document.getElementsByClassName('measure').length > 0) {
		document.getElementsByClassName('measure')[0].remove();
	}
	// draw measure lines, assume 4/4 time signature only for the time being
	var maxBeat = songInformation['maxBeat'];
	var measureG = d3.select('.notes').append('g').attr('class', 'measure').attr('id', 'measure');
	for (var measureBeat = 0; measureBeat <= maxBeat; measureBeat = measureBeat + 64) {
		var height = bottom - measureBeat * spacing;
		measureG.append('rect')
			.attr('class', 'measureLine')
			.attr('x', left)
			.attr('y', height)
			.attr('width', width * 6)
			.attr('height', 5)
			.style('fill', 'white')
			.style('opacity', 0.3);
	}
}

function drawBeats(d) {
	if (d.beatType <= 3) { // buttons and fxs only
		var leftX = 0;
		var rightX = 0;
		var topY = 0;
		var bottomY = 0;

		if (d.beatType == 0) {
			leftX = left + width + (width * d.lanePositionStart) + (padding);
			rightX = left + 2*width + (width * d.lanePositionStart) - (padding);
			topY = bottom - (d.beatStart * spacing) - btnHeight;
			bottomY = bottom - (d.beatStart * spacing);
		} else if (d.beatType == 1) {
			leftX = left + width + (width * d.lanePositionStart) + (padding);
			rightX = left + 2*width + (width * d.lanePositionStart) - (padding);
			topY = bottom - (d.beatEnd * spacing);
			bottomY = bottom - (d.beatStart * spacing);
		} else if (d.beatType == 2) {
			leftX = left + width + (2 * width * d.lanePositionStart) + (padding/2);
			rightX = left + 3*width + (2 * width * d.lanePositionStart) - (padding/2);
			topY = bottom - (d.beatStart * spacing) - btnHeight;
			bottomY = bottom - (d.beatStart * spacing);
		} else if (d.beatType == 3) {
			leftX = left + width + (2 * width * d.lanePositionStart) + (padding/2);
			rightX = left + 3*width + (2 * width * d.lanePositionStart) - (padding/2);
			topY = bottom - (d.beatEnd * spacing);
			bottomY = bottom - (d.beatStart * spacing);
		}
		return leftX + "," + topY + " " + rightX + "," + topY + " " + rightX + "," + bottomY + " " + leftX + "," + bottomY;
	} else {
		// the entire laser section will be created as one giant polygon
		// the stack is used to store points on the other side of the laser
		// we store all left-side vertices to form the polygon first, and put right-side vertices in order on a stack
		// once all left-side vertices are stored, right-side vertices popped off the stack into the vertices list
		var vertices = [];
		var stack = [];

		// if there's a slam, next laser segment needs to have its bottom height moved up to match the height of the slam so that it doesn't cut into the polygon
		var slamCondition = 0;
		var slamHeight = 0;

		var laserSegments = d.laserSegments;
		for (var i = 0; i < d.laserSegments.length; i++) {
			var e = d.laserSegments[i];
			if (e.beatEnd - e.beatStart < 3 && Math.abs(e.lanePositionStart - e.lanePositionEnd) > 0.1) { // slam lasers are lasers that change very rapidly - second condition is to make sure the case where there's a really short straight laser doesn't count as a slam
				var leftStart = e.lanePositionStart;
				var rightStart = e.lanePositionEnd;
				if (e.lanePositionStart > e.lanePositionEnd) {
					leftStart = e.lanePositionEnd;
					rightStart = e.lanePositionStart;
				}

				leftX = left + (width * leftStart) + (padding);
				rightX = left + width + (width * rightStart) - (padding);
				topY = bottom - (e.beatStart * spacing) - (btnHeight * 4);
				bottomY = bottom - (e.beatStart * spacing);
				if (e.laserStart) { // if laser start, add a straight stub to the beginning

					if (e.lanePositionStart == leftStart) {
						vertices.push(leftX + "," + (bottomY+(btnHeight*3)));
						vertices.push(leftX + "," + topY);
						stack.push((leftX+width-padding-padding) + "," + (bottomY+(btnHeight*3)));
						stack.push((leftX+width-padding-padding) + "," + bottomY);
						stack.push(rightX + "," + bottomY);
						stack.push(rightX + "," + topY);
					} else {
						vertices.push((rightX-width+padding+padding) + "," + (bottomY+(btnHeight*3)));
						vertices.push((rightX-width+padding+padding) + "," + bottomY);
						vertices.push(leftX + "," + bottomY);
						vertices.push(leftX + "," + topY);
						stack.push(rightX + "," + (bottomY+(btnHeight*3)));
						stack.push(rightX + "," + topY);
					}

					if (i == d.laserSegments.length - 1) { // if also a laser end, add a short straight end segment
						if (e.lanePositionStart == leftStart) {
							vertices.push((rightX-width+padding+padding) + "," + topY);
							vertices.push((rightX-width+padding+padding) + "," + (topY-(btnHeight*3)));
							stack.pop();
							stack.push(rightX + "," + (topY-(btnHeight*3)));
						} else {
							stack.push(leftX+width-padding-padding + "," + topY);
							stack.push(leftX+width-padding-padding + "," + (topY-(btnHeight*3)));
							vertices.pop();
							vertices.push(leftX + "," + (topY-(btnHeight*3)));
						}
					}
				} else if (i == d.laserSegments.length - 1) { // if this is a final slam, add a short straight end segment

					if (e.lanePositionStart == leftStart) {
						vertices.push(leftX + "," + bottomY);
						vertices.push(leftX + "," + topY);
						vertices.push((rightX-width+padding+padding) + "," + topY);
						vertices.push((rightX-width+padding+padding) + "," + (topY-(btnHeight*3)));
						stack.push(rightX + "," + bottomY);
						stack.push(rightX + "," + (topY-(btnHeight*3)));
					} else {
						vertices.push(leftX + "," + bottomY);
						vertices.push(leftX + "," + (topY-(btnHeight*3)));
						stack.push(rightX + "," + bottomY);
						stack.push(rightX + "," + topY);
						stack.push(leftX+width-padding-padding + "," + topY);
						stack.push(leftX+width-padding-padding + "," + (topY-(btnHeight*3)));
					}
					
				} else {

					vertices.push(leftX + "," + bottomY);
					vertices.push(leftX + "," + topY);
					stack.push(rightX + "," + bottomY);
					stack.push(rightX + "," + topY);
				}

				slamCondition = 1;
				slamHeight = topY;
				
			} else { // non-slam lasers
				var topY = bottom - (e.beatEnd * spacing);
				var bottomY = bottom - (e.beatStart * spacing);
				var leftBottomX = left + (width * e.lanePositionStart) + (padding);
				var rightBottomX = left + width + (width * e.lanePositionStart) - (padding);
				var leftTopX = left + (width * e.lanePositionEnd) + (padding);
				var rightTopX = left + width + (width * e.lanePositionEnd) - (padding);
				if (e.laserStart) {
					vertices.push(leftBottomX + "," + (bottomY+(btnHeight*3)));
					vertices.push(leftBottomX + "," + bottomY);
					vertices.push(leftTopX + "," + topY);
					stack.push(rightBottomX + "," + (bottomY+(btnHeight*3)));
					stack.push(rightBottomX + "," + bottomY);
					stack.push(rightTopX + "," + topY);
				} else {
					if (slamCondition == 1) { // check if previous laser segment was a slam
						// if so, add bottom changes to match up with height of previous slam
						vertices.push(leftBottomX + "," + slamHeight);
						stack.push(rightBottomX + "," + slamHeight);
					} else { // else, draw normally
						vertices.push(leftBottomX + "," + bottomY);
						stack.push(rightBottomX + "," + bottomY);
					}
					vertices.push(leftTopX + "," + topY);
					stack.push(rightTopX + "," + topY);
				}
				slamCondition = 0;
				slamHeight = 0;
			}
		}

		// add the right-side vertices to the polygon list by popping off the stack
		while (stack.length > 0) {
			vertices.push(stack.pop());
		}

		// create the list of polygons using the vertices list generated
		var verticesString = "";
		for (var v = 0; v < vertices.length; v++) {
			verticesString = verticesString + vertices[v];
			if (v != vertices.length - 1) {
				verticesString = verticesString + " ";
			}
		}
		return verticesString;
	}
}

// play/pauses the current scrolling, determined by checking if the scroll object (class = .notes) has the class transitioning on it
function toggleTransition() {
	var maxBeat = songInformation['maxBeat'];
	var metadata = songInformation['metadata'];
	var canvas = d3.select(".notes");
	var sound = document.getElementById('sound');
	if (canvas.classed('transitioning')) { // if it is currently transitioning, interrupt it (stop it)
		canvas.classed('transitioning', false);
		d3.selectAll('.longbtn').attr('opacity', 0.6);
		d3.selectAll('.longfx').attr('opacity', 0.6);
		d3.selectAll('.laser').attr('opacity', 0.5);
		canvas.interrupt();
		sound.pause();
		clearInterval(globalTimer);
		document.exitPointerLock();
		document.removeEventListener("mousemove", updateMousePosition, false);
	} else { // else, start the transition

		// get the current progress of the transition (current height)
		var currentHeight = getTranslateHeight();
		guessedHeight = currentHeight;

		// based on the proportion of remaining height left to travel over total height, determine the remaining duration needed to finish the transition
		var maxDuration = (maxBeat / 16 / +metadata.t) * 60 * 1000;
		var maxHeight = maxBeat * spacing;
		var heightProportion = (maxHeight - currentHeight) / (maxHeight * 1.0);
		var remainingDuration = maxDuration * heightProportion;

		// audio
		var songStart = +metadata.o; // in milliseconds
		var audioDuration = maxBeat / 16.0 / (+metadata.t / 60.0);
		if (sound.readyState == 4) {
			songStart = (audioDuration * (currentHeight / (maxHeight * 1.0))) * 1000 + (+metadata.o);
		}

		if (songStart < 0) {
			setTimeout(function() {
				sound.currentTime = 0;
				sound.play(0);
			}, songStart * -1);
		} else {
			console.log(songStart);
			sound.currentTime = songStart / 1000.0;
			sound.play();
		}

		canvas.transition().attr('transform', 'translate(0, ' + maxHeight + ")").duration(remainingDuration).ease(d3.easeLinear).on("end", function() {
			var canvas = d3.select(".notes");
			canvas.classed('transitioning', false);
			d3.selectAll('.longbtn').attr('opacity', 0.6);
			d3.selectAll('.longfx').attr('opacity', 0.6);
			d3.selectAll('.laser').attr('opacity', 0.5);
			setTimeout(function() {
				clearInterval(globalTimer);
				document.exitPointerLock();
				document.removeEventListener("mousemove", updateMousePosition, false);
			}, 500);
		});
		canvas.classed('transitioning', true);

		// start game loop
		heightPerFrame = (maxHeight / (audioDuration * 1000)) * frameLength;
		tickRate = (maxHeight / maxBeat) * 4
		keysHit = [0, 0, 0, 0, 0, 0, 0, 0];
		keyIndex = 0;
		laneIndexes = [0, 0, 0, 0, 0, 0, 0, 0];
		keysUp = [0, 0, 0, 0, 0, 0, 0, 0];
		holdDown = [0, 0, 0, 0, 0, 0, 0, 0];
		prevHoldTick = [-1, -1, -1, -1, -1, -1, -1, -1];
		slamIndexes = [0, 0];
		slamHeightSuccess = [0, 0];
		globalTimer = setInterval(gameLoop, frameLength);
	}
}

function updatePosition(slideAmount) {
	var maxBeat = songInformation['maxBeat'];
	var maxHeight = maxBeat * spacing;
	var changedHeight = maxHeight * (slideAmount / 200.0)
	var canvas = d3.select(".notes");
	canvas.transition().attr('transform', 'translate(0, ' + changedHeight + ")").ease(d3.easeLinear);
}

function storeMusic(files) {
	var sound = document.getElementById('sound');
	sound.src = URL.createObjectURL(files[0]);
}

function updateSpacing(new_spacing) {
	var old_spacing = spacing;
	spacing = new_spacing;
	createNotes();
	var currentHeight = getTranslateHeight();
	var currentBeat = currentHeight / old_spacing;
	var newHeight = currentBeat * spacing;
	var canvas = d3.select('.notes');
	canvas.attr('transform', 'translate(0, ' + newHeight + ")");
}

function getTranslateHeight() {
	// get the current progress of the transition (current height)
	var translate = d3.select('.notes').attr('transform');
	translate = translate.substring(translate.indexOf('translate('));
	translate = translate.substring(0, translate.indexOf(')'));
	var translateSplit = translate.split(',');
	var currentHeight = +translateSplit[1];
	return currentHeight;
}

// on key down, store it into keysHit list to be processed later by the game loop
document.onkeydown = function(e) {
	var canvas = d3.select(".notes");
	if (canvas.classed('transitioning')) {
		// temporary mapping = wrip for buttons, eo for fx, qv for left laser, [m for right laser
		switch(e.which) {
			case 87:
				keysHit[0]++;
				break;
			case 82:
				keysHit[1]++;
				break;
			case 73:
				keysHit[2]++;
				break;
			case 80:
				keysHit[3]++;
				break;
			case 69:
				keysHit[4]++;
				break;
			case 79:
				keysHit[5]++;
				break;
			default:
				console.log(e);
		}
	}
};

// on key up, store it into keysUp list to be processed later by the game loop
document.onkeyup = function(e) {
	var canvas = d3.select(".notes");
	if (canvas.classed('transitioning')) {
		// temporary mapping = wrip for buttons, eo for fx, qv for left laser, [m for right laser
		switch(e.which) {
			case 87:
				keysUp[0]++;
				break;
			case 82:
				keysUp[1]++;
				break;
			case 73:
				keysUp[2]++;
				break;
			case 80:
				keysUp[3]++;
				break;
			case 69:
				keysUp[4]++;
				break;
			case 79:
				keysUp[5]++;
				break;
			default:
				console.log(e);
		}
	}
};

function updateMousePosition(e) {
	mousePosition[0] = e.movementX;
	mousePosition[1] = e.movementY;
	mouseTimestamp = e.timeStamp;
}

// the actual game loop runs/repeats here
function gameLoop() {
	// we guess the height (because it's faster) by using the amount of time elapsed per function call (fixed number)
	// this will break if the game lags (if this function takes longer than the specified time to repeat), so it's not robust
	guessedHeight = guessedHeight + heightPerFrame;

	// get the combo info here
	var comboElement = d3.select('.comboText');
	var combo = 0;
	var comboBreak = 0;

	// get mouse delta
	var deltaX = 0;
	var deltaY = 0;
	if (oldTimestamp != mouseTimestamp) {
		deltaX = mousePosition[0];
		deltaY = mousePosition[1];
		oldTimestamp = mouseTimestamp;
	}

	// loop through every lane element and process the notes
	for (var i = 0; i < lanes.length; i++) {
		var hitList = laneBeats[lanes[i]];
		var loop = 1;
		var index = laneIndexes[i];
		var timesHit = keysHit[i];
		var originalCount = keysHit[i];
		keysHit[i] = keysHit[i] - originalCount;
		var timesRaised = keysUp[i];
		keysUp[i] = keysUp[i] - timesRaised;
		var timing = 99;

		// hold tracking
		var held = 0;
		var holdIndex = 0;

		// laser tracking
		var drawPointer = 0;



		// go through the current lane's elements and see if any processing needs to be done
		// i.e. - if user hit, is there a note object in range? if so, what was the timing?
		// 		  if note has gone past the screen, deem it as a miss
		// keep looping until we are told to break or if we are out of elements to look at
		// laser case has two indices we need to be checking for, hence the separate case for laser slam indexes)
		while (loop == 1 && (index < hitList.length || (i >= 6 && slamIndexes[i-6] < hitList.length))) {
			if ( (i < 6) && (hitList[index].beatType == 0 || hitList[index].beatType == 2)) { // if its a single chip note
				var nextBeatHeight = hitList[index].beatStart * spacing; // height of the next beat
				if (timesHit == 0) { // if user did not press the current key between this frame and the last frame
					if (guessedHeight >= nextBeatHeight + (5*heightPerFrame)) { // if the beat already scrolled past, count it as a miss, combo break, then check the next element 
						index++;
						comboBreak = 1;
					} else { // if the beat object has not scrolled past yet, don't do anything - exit the loop
						loop = 0;
					}
				} else { // if the user did press the current key between this frame and the last frame
					if (guessedHeight < nextBeatHeight - (8*heightPerFrame)) { // way too early, don't do anything
						loop = 0;
						timing = 99;
					} else if (guessedHeight < nextBeatHeight - (5*heightPerFrame)) { // too early, count as miss
						timesHit--;
						index++;
						comboBreak = 1;
					} else if (guessedHeight < nextBeatHeight - (2*heightPerFrame)) { // early, count as early (near)
						index++;
						loop = 0;
						combo++;
						timing = -1;
					} else if (guessedHeight < nextBeatHeight + (2*heightPerFrame)) { // perfect timing
						index++;
						loop = 0;
						combo++;
						timing = 0;
					} else if (guessedHeight < nextBeatHeight + (5*heightPerFrame)) { // late, count as late (near)
						index++;
						loop = 0;
						combo++;
						timing = 1;
					} else { // too late, count as miss
						index++;
						comboBreak = 1;
					}
				}
			} else if ( (i < 6) && (hitList[index].beatType == 1 || hitList[index].beatType == 3)) { // if its a hold
				// get hold's height ranges
				var nextBeatStart = hitList[index].beatStart * spacing;
				var nextBeatEnd = hitList[index].beatEnd * spacing;
				holdIndex = index;

				// if the user pressed a key
				if (timesHit > 0) {
					if (guessedHeight < nextBeatStart - (5*heightPerFrame)) { // if note is still too early, do nothing and exit loop
						loop = 0;
					} else if (guessedHeight >= (nextBeatStart - (5*heightPerFrame)) && guessedHeight < nextBeatEnd) { // if note is in range, register the hold
						holdDown[i] = 1;
					}
				} else if (timesRaised > 0 && guessedHeight < nextBeatEnd - (5*heightPerFrame)) { // if user lifted the key, un-register the hold
					holdDown[i] = 0;
				}

				if (holdDown[i] == 1) { // if the hold is registered
					held = 1;
					if (guessedHeight < nextBeatStart) { // if still slightly too early, don't do anything and exit the loop
						loop = 0;
					} else if (guessedHeight >= nextBeatStart && guessedHeight < nextBeatEnd+ (1*heightPerFrame)) { // if object has hit judgement line (and hasn't exit yet), add to combo and process hits
						loop = 0;

						// starts the height at the beginning of the hold or the last hold height reached (from the last frame)
						// hold heights are processed in ticks - the height traveled using 1/16th of a beat time
						// this is stored in tickRateAddition
						var tickRateAddition = nextBeatStart;
						if (prevHoldTick[i] != -1) {
							tickRateAddition = prevHoldTick[i];
						}

						// add tickRates to the tickRateAddition (and increment hits/combo) until it surpasses the current height
						while (tickRateAddition < guessedHeight) {
							combo++;
							tickRateAddition = tickRateAddition + tickRate;
						}

						// save the currently reached hold tick height for use in the next frame
						prevHoldTick[i] = tickRateAddition;
					} else { // if hit object fully finished traveling the judgement line, move on to next note and un-register the hold
						holdDown[i] = 0;
						prevHoldTick[i] = -1;
						index++;
						held = 0;
					}
				} else { // if the hold is not registered
					if (guessedHeight >= (nextBeatStart + (5*heightPerFrame)) && guessedHeight < nextBeatEnd+ (1*heightPerFrame)) { // if object is currently traversing the judgement line, do the same thing as a hold-register but count each tick as a miss
						loop = 0;
						var tickRateAddition = nextBeatStart;
						if (prevHoldTick[i] != -1) {
							tickRateAddition = prevHoldTick[i];
						}
						while (tickRateAddition < guessedHeight) {
							// TODO: increment miss count here
							tickRateAddition = tickRateAddition + tickRate;
							comboBreak = 1;
						}

						prevHoldTick[i] = tickRateAddition;
					} else if (guessedHeight < (nextBeatStart + (5*heightPerFrame))) { // if too early, do nothing
						loop = 0;
					} else { // if too late, proceed to next note
						holdDown[i] = 0;
						prevHoldTick[i] = -1;
						index++;
					}
				}
			} else { // lasers

				// determine which laser (L or R), to know what axis to use (X or Y)
				var delta = deltaY;
				if (i == 6) {
					delta = deltaX;
				}

				var previewPoint = -10;
				var previewHeight = 9999999;

				// slam laser processing - treat as normal note - skip all normal lasers
				var innerLoop = 1;
				var slamIndex = slamIndexes[i-6];
				while (innerLoop == 1 && slamIndex < hitList.length) {
					while (slamIndex < hitList.length && (hitList[slamIndex].beatEnd - hitList[slamIndex].beatStart >= 3 || hitList[slamIndex].lanePositionStart == hitList[slamIndex].lanePositionEnd)) { // not slam
						slamIndex++;
					}

					if (slamIndex >= hitList.length) {
						continue;
					}

					// get slam's height
					var nextSlamHeight = hitList[slamIndex].beatStart * spacing;
					var slamDirection = hitList[slamIndex].lanePositionEnd - hitList[slamIndex].lanePositionStart;

					// check if a preview point is needed
					if (hitList[slamIndex].laserStart == true && guessedHeight > nextSlamHeight - (32*heightPerFrame) && guessedHeight < nextSlamHeight) {
						previewHeight = nextSlamHeight;
						previewPoint = hitList[slamIndex].lanePositionStart;
					} 

					// TODO: make this first check be more lenient on the early side - meaning guessedHeight < nextSlamHeight - (2*heightPerFrame)
					// this requires changing the normal laser part to make sure that when the slam pointer moves, the normal laser doesn't move the slam pointer back to its previous location
					if (guessedHeight < nextSlamHeight) { // too early to process the slam, ignore it
						innerLoop = 0;
					} else if (guessedHeight >= (nextSlamHeight - (5*heightPerFrame)) && (guessedHeight < nextSlamHeight + (5*heightPerFrame))) { // in time
						drawPointer = 1;
						innerLoop = 0;
						if ((delta < 0 && slamDirection < 0) || (delta > 0 && slamDirection > 0)) {
							pointerPositions[i-6] = hitList[slamIndex].lanePositionEnd;
							combo++;
							innerLoop = 1;
							laserHit[i-6] = 1;
							gracePeriod[i-6] = 1;
							slamHeightSuccess[i-6] = hitList[slamIndex].beatEnd * spacing;
							laserHitIndex[i-6] = hitList[slamIndex].beatStartSegment;
							slamIndex++;
						}							
					} else { // too late to process
						slamIndex++;
						comboBreak = 1;
						laserHit[i-6] = 0;
						slamProcessed[i-6] = 0;
					}
				}

				slamIndexes[i-6] = slamIndex;



				// normal laser processing - skip all slam indexes *************************** //
				while (index < hitList.length && hitList[index].beatEnd - hitList[index].beatStart < 3 && hitList[index].lanePositionStart != hitList[index].lanePositionEnd) { // slam
					index++;
				}

				if (index < hitList.length) {
					// get laser's height ranges
					var nextBeatStart = hitList[index].beatStart * spacing;
					var nextBeatEnd = hitList[index].beatEnd * spacing;

					var direction = hitList[index].lanePositionEnd - hitList[index].lanePositionStart;

					
					if (guessedHeight < nextBeatStart) {
						loop = 0;
						if (hitList[index].laserStart == true && guessedHeight > nextBeatStart - (32*heightPerFrame) && nextBeatStart < previewHeight) {
							previewPoint = hitList[index].lanePositionStart;
						}

						// if this is the break/pause before hitting a slam slightly early and the next
						// long laser that is directly attached to the slam, don't draw the preview point
						// because it's not actually a preview
						if (nextBeatStart == slamHeightSuccess[i-6]) {
							previewPoint = -10;
						}
					} else if (guessedHeight >= nextBeatStart && guessedHeight < nextBeatEnd) { // get laser's current x-position (approximation)
						drawPointer = 1;
						previewPoint = -10;
						var ratio = (guessedHeight - nextBeatStart) / (nextBeatEnd - nextBeatStart);
						var currentLaserPosition = (hitList[index].lanePositionEnd - hitList[index].lanePositionStart) * ratio + hitList[index].lanePositionStart;
						var xDifference = currentLaserPosition - pointerPositions[i-6];

						if (guessedHeight > slamHeightSuccess[i-6]) {
							if (Math.abs(xDifference) <= 0.5 && direction != 0) {
								if ((delta < 0 && direction < 0) || (delta > 0 && direction > 0)) {
									pointerPositions[i-6] = currentLaserPosition;
								}
							} else {
								if ((delta < 0 && xDifference < 0) || (delta > 0 && xDifference > 0)) {
									pointerPositions[i-6] = currentLaserPosition;
								}
							}
						}

						// only increment/check for hit/miss at every tick rate, not every frame
						var tickRateAddition = nextBeatStart;
						if (prevHoldTick[i] != -1) {
							tickRateAddition = prevHoldTick[i];
						}
						while (tickRateAddition < guessedHeight) {
							tickRateAddition = tickRateAddition + tickRate;
							if (tickRateAddition <= slamHeightSuccess[i-6] + (4*heightPerFrame)) {
								combo++;
								laserHitIndex[i-6] = hitList[index].beatStartSegment;
								laserHit[i-6] = 1;
								console.log('grace');
							} else if (pointerPositions[i-6] > currentLaserPosition - 0.5 && pointerPositions[i-6] < currentLaserPosition + 0.5) {
								combo++;
								laserHit[i-6] = 1;
								laserHitIndex[i-6] = hitList[index].beatStartSegment;
								gracePeriod[i-6] = 1;
							} else if (gracePeriod[i-6] > 0) {
								gracePeriod[i-6] = gracePeriod[i-6] - 1;
								combo++;
								laserHitIndex[i-6] = hitList[index].beatStartSegment;
								laserHit[i-6] = 1;
							} else {
								// TODO: increment miss count here
								comboBreak = 1;
								laserHit[i-6] = 0;
							}
						}
						// save the currently reached hold tick height for use in the next frame
						prevHoldTick[i] = tickRateAddition;
						loop = 0;
					} else {
						index++;
						previewPoint = -10; // don't change pointer position this time around since we're relooping
						prevHoldTick[i] = -1;
					}
				} else {
					loop = 0;
				}

				if (previewPoint != -10) {
					pointerPositions[i-6] = previewPoint;
					drawPointer = 1;
				}
			}
		}

		// save and reset some variables
		laneIndexes[i] = index;

		// add feedback flashes to note hits
		if (originalCount > 0) {
			if (timing == 0) {
				d3.select('.feedback' + i).attr('opacity', 0.5).attr('fill', 'url(#hitGradient)');
				d3.select('.feedback' + i).transition().attr('opacity', 0);
			} else if (timing == 1) {
				d3.select('.feedback' + i).attr('opacity', 0.5).attr('fill', 'url(#lateGradient)');
				d3.select('.feedback' + i).transition().attr('opacity', 0);
			} else if (timing == -1) {
				d3.select('.feedback' + i).attr('opacity', 0.5).attr('fill', 'url(#earlyGradient)');
				d3.select('.feedback' + i).transition().attr('opacity', 0);
			} else {
				d3.select('.feedback' + i).attr('opacity', 0.5).attr('fill', 'url(#noneGradient)');
				d3.select('.feedback' + i).transition().attr('opacity', 0);
			}
		}

		// change opacity of hold notes (if they are being held, to give feedback)
		if (held == 1) {
			d3.selectAll('.long' + i + 'time' + Math.round(hitList[holdIndex].beatStart)).attr('opacity', 0.8);
		} else {
			d3.selectAll('.long' + i + 'time' + Math.round(hitList[holdIndex].beatStart)).attr('opacity', 0.6);
		}

		// update laser opacity (if they are being hit, to give feedback)
		if (laserHit[i-6] == 1) {
			d3.selectAll('.laser' + i + 'time' + Math.round(laserHitIndex[i-6])).attr('opacity', 0.7);
		} else {
			d3.selectAll('.laser' + i + 'time' + Math.round(laserHitIndex[i-6])).attr('opacity', 0.5);
		}

		// update laser pointer positions
		if (drawPointer == 1) {
			d3.select('.pointer' + i).attr('x', left + pointerPositions[i-6] * 50).attr('opacity', 0.75);
		} else {
			d3.select('.pointer' + i).attr('x', left + pointerPositions[i-6] * 50).attr('opacity', 0);
		}

	}

	// change the current combo accordingly
	var currentCombo = +comboElement.text();
	currentCombo = currentCombo + combo;
	if (comboBreak == 1) {
		currentCombo = 0;
	}
	comboElement.text(currentCombo);
}