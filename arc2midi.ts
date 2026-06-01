// convert arcade songs into midi
namespace arc2MIDI {
    let instrumentDataArray: Buffer[] = [ // assign instrument to its respective channel if any of the instrument data is recognised, otherwise use grand piano (0)
        hex`010A006400F401640000040000000000000000000000000005000004`, // dog instrument = ocarina (79)
        hex`0F05001202C102C20100040500280000006400280003140006020004`, // duck instrument = synth charang (84)
        hex`0C960064006D019001000478002C010000640032000000000A060005`, // cat instrument = violin (40)
        hex`01DC00690000045E0100040000000000000000000005640001040003`, // fish instrument = clarinet (71)
        hex`100500640000041E000004000000000000000000000000000A040004`, // car instrument = slap bass 2 (37)
        hex`0F0A006400F4010A0000040000000000000000000000000000000002`, // computer instrument = square lead (80)
        hex`010A006400F401640000040000000000000000000000000000000002`, // burger instrument = pizzicato strings (45)
        hex`020A006400F401640000040000000000000000000000000000000003`, // cherry instrument = saw lead (81)
        hex`0E050046006603320000040A002D0000006400140001320002010002`  // lemon instrument = acoustic bass (32)
    ];
    let midiInstrumentIndexArray: uint8[] = [
        79,
        84,
        40,
        71,
        37,
        80,
        45,
        81,
        32
    ];
    let trackNameArray: string[] = [
        "Dog",
        "Duck",
        "Cat",
        "Fish",
        "Car",
        "Computer",
        "Burger",
        "Cherry",
        "Lemon",
        "Drums"
    ]
    /*let arcadePercussionArray: Buffer[] = [
        hex`026400000403780000040A0003010000006400`,
        hex`01C800000401000000006400`,
        hex`01640000040100000000FA00`,
        hex`04AF00000401C80000040A00019600000414000501006400140005010000002C01`,
        hex``
    ];*/
    let arcadePercussionMIDINoteArray: uint8[] = [36, 36, 41, 38, 40, 42, 44, 46, 49, 39, 35, 35, 35, 35, 45, 48, 50, 35, 35, 53, 53, 35, 35, 35];
    let trackNames: string[] = [];
    function int2vlq(int: number) { // convert integer to variable quantity length to state duration of events
        let vlq = [];
        do {
            let chunk = int & 0x7F;
            int >>= 7;
            if (vlq.length > 0) {
                chunk |= 0x80;
            }
            vlq.push(chunk);
        } while (int > 0);
        vlq.reverse();
        return vlq;
    };

    function calculateBitLength(val: number) { // calculate bit length of number to calculate vlq length
        if (val === 0) {
            return 1;
        } else {
            return Math.floor(Math.log(Math.abs(val))) / Math.log(2);
        }
    };

    function getTrackData(file: Buffer) { // extract track from arcade song file and store them in array
        let byteInd: number = 7;
        let trackArray: Buffer[] = [];
        for (let trk = 0; trk < trackAmount; trk++) {
            trackArray.push(file.slice(byteInd, file.getNumber(NumberFormat.UInt16LE, byteInd + 32) + 34));
            byteInd += file.getNumber(NumberFormat.UInt16LE, byteInd + 32) + 34;
        }
        return trackArray;
    };

    function convertArcNotetoMIDINote(note: number, octave: number) { // convert arcade note to midi note on/off event
        return (note & 63) + (12 * octave) - 1;
    };

    function extractPercEvents(track: Buffer) { // extract events if its percussion
        //let percussionStepData: Buffer = track.slice(4,track.getNumber(NumberFormat.UInt16LE,2));
        let percussionNoteData: Buffer = track.slice(4 + track.getNumber(NumberFormat.UInt16LE, 2) + 2); // 4 = track header data before percussion step data. 2 = byte length of note data after step data
        //let percussionStep: Buffer;
        /*for (let ind = 0; ind < percussionStepData.length; ind++) {
            percussionStep = percussionStepData.slice(ind,percussionStepData.getUint8(ind)*7+5);
            //arcadePercussionArray.push(36);
            ind += percussionStepData.getUint8(ind) * 7 + 4; // -1 to avoid skipping a byte
            game.splash(ind);
        }*/
        return percussionNoteData;
    }

    function extractEvents(track: Buffer, channelNo: number) { // extract note data from the extracted tracks and store each note in an array
        let cleanTrk: Buffer = track.slice(34); // raw track data without any header/instrument info
        let instrumentOctave: number = track.getUint8(31); // get instrument octave
        let events: number[][] = [];
        let deltaEvents: number[] = [];
        let deltaInd: number = 0;
        let byteIndex: number = 0;
        let noteAmount: number = 1;
        let trackInstrument = track.slice(4,28);
        if (channelNo > 15) { channelNo = 0 };
        if (channelNo === 9) { channelNo = 10 }; // channel 0xn9 (channel 10) is reserved for percussion
        if (noteVelocity > 0x7f) { noteVelocity = 0x7f; };
        if (track[1] === 1) { // second byte of track determines if track is melodic or percussive. 0 = melodic     1 = percussion
            channelNo = 9;
            isPercussion = true;
            cleanTrk = extractPercEvents(track);
        } else {
            isPercussion = false;
        } // detect if track is percussion/drum, then skip this track to prevent it from crashing (temp)
        for (let i = 0; i < instrumentDataArray.length; i++) {
            if (instrumentDataArray[i].equals(trackInstrument)) {
                //game.splash(`instrument ${i} recognised`, [0x00, (0xc0 + channelNo), midiInstrumentIndexArray[i]])
                events.push([0x00, (0xc0 + channelNo), midiInstrumentIndexArray[i]]);
                trackNames.push(trackNameArray[i]);
                break;
            }
        }
        if (events[0]===undefined) {
            events.push([0x00, (0xc0 + channelNo), 0x00]);
            trackNames.push(`TRACK ${(channelNo.toString().length)<2?"0"+channelNo:channelNo}`);
        }

        while (byteIndex < cleanTrk.length) {
            noteAmount = 0;
            while (noteAmount < cleanTrk.getUint8(byteIndex + 4)) {
                events.push([cleanTrk.getNumber(NumberFormat.UInt16LE, 0 + byteIndex) * (tick480 ? tickConstant : 1), 0x90 + channelNo, (!isPercussion) ? convertArcNotetoMIDINote(cleanTrk.getUint8(noteAmount + byteIndex + 5), instrumentOctave) : arcadePercussionMIDINoteArray[cleanTrk.getUint8(noteAmount + byteIndex + 5)], noteVelocity]);
                events.push([cleanTrk.getNumber(NumberFormat.UInt16LE, 2 + byteIndex) * (tick480 ? tickConstant : 1), 0x80 + channelNo, (!isPercussion) ? convertArcNotetoMIDINote(cleanTrk.getUint8(noteAmount + byteIndex + 5), instrumentOctave) : arcadePercussionMIDINoteArray[cleanTrk.getUint8(noteAmount + byteIndex + 5)], 0]);
                noteAmount++;
            }
            byteIndex += (5 + cleanTrk.getUint8(byteIndex + 4));
        }
        events.sort((a, b) => {
            return a[0] - b[0];
        });
        deltaEvents.push(events[0][0]);
        while (deltaInd < events.length - 1) {
            deltaEvents.push(events[deltaInd + 1][0] - events[deltaInd][0]);
            deltaInd++;
        }
        deltaInd = 0;
        while (deltaInd < events.length) {
            events[deltaInd][0] = deltaEvents[deltaInd];
            deltaInd++;
        }
        return events;
    };

    function generateTrack(events: number[][], trackNumber?: number,) { // generate midi track
        if (trackNumber === undefined) { trackNumber = 0; };
        let trackBuffer: Buffer = Buffer.create(8);
        let eventBuffer: Buffer = Buffer.create(0);
        trackBuffer.write(0, Buffer.fromUTF8("MTrk")); // midi header
        trackBuffer = trackBuffer.concat(Buffer.fromHex("00ff03aa")); // declare track name
        //if (isPercussion) {
        //    return Buffer.fromHex("4D54726B0000001200FF030A5045524320545241434B00FF2F00");
        //} // detect if percussion, then return empty track;
        trackBuffer.setUint8(11,trackNames[trackNumber].length); // set track name length
        trackBuffer = trackBuffer.concat(Buffer.fromUTF8(trackNames[trackNumber])); // set track name
        events.forEach(function (value, index) {
            int2vlq(value[0]).forEach(function (v, i) {
                eventBuffer = eventBuffer.concat(Buffer.fromArray([v]));
            });
            eventBuffer = eventBuffer.concat(Buffer.fromArray(((value[1] - (value[1] % 16)) === 192) ? [value[1], value[2]]:[value[1], value[2], value[3]])); // if program change event then [value[1],value[2]]
            trackBuffer = trackBuffer.concat(eventBuffer);
            eventBuffer = Buffer.create(0);
        });
        trackBuffer = trackBuffer.concat(Buffer.fromHex("00ff2f00"));
        trackBuffer.setNumber(NumberFormat.UInt32BE, 4, trackBuffer.length - 8);
        return trackBuffer;
    };

    function assembleMIDIFile(trackArrays: Buffer[]) { // assemble standard midi file 
        let finalMIDI: Buffer = Buffer.create(14); // final midi file
        let starterTrack: Buffer = Buffer.create(42); // tempo track

        finalMIDI.write(0, Buffer.fromUTF8("MThd"));
        finalMIDI.setUint8(7, 6);
        finalMIDI.setUint8(9, 1); // set smf type to 1
        finalMIDI.setNumber(NumberFormat.UInt16BE, 10, trackAmount + 1); // set number of tracks. add one extra to include the tempo track
        finalMIDI.setNumber(NumberFormat.UInt16BE, 12, tick480 ? 480 : tickRate); // set tick rate to 480 or tickrate depending on user config
        starterTrack.write(0, Buffer.fromUTF8("MTrk")); // midi tempo track
        starterTrack.setUint8(7, 34); // midi tempo track length
        starterTrack.write(8, Buffer.fromHex("00ff030b")); // set track name to 'TEMPO TRACK'
        starterTrack.write(12, Buffer.fromUTF8("TEMPO TRACK")); // above
        starterTrack.write(23, Buffer.fromHex("00ff5804aa021808")); // set time signature
        /*
            time signature format:
                0xff    meta event
                0x58    time signature event
                0x04    4 bytes long
                0xaa    numerator
                0x02    denominator expressed as a negative power of 2. 0x02 = 2^2=4        0x03 = 2^3 = 4      0x04 = 2^4 = 16
                0x18    midi clocks per metronome count. this is only for metronome counting. you can tell the metronome to count every 2 beats regardless of time sig. by setting value to 0x30 (48) assuming 24 clocks = quarter note
                0x08    number of 32nd notes in the beat. if its 6/8, set value to 0x04. if its 4/4, set value to 0x08
        */
        starterTrack.setUint8(27, timeSignature); // above
        starterTrack.write(31, Buffer.fromHex("00ff5103aabbcc")); // set tempo
        starterTrack.setNumber(NumberFormat.UInt32BE, 34, (60 / bpm) * 1000000); // set tempo to tempo in microseconds/beat
        starterTrack.setUint8(34, 3); 
        starterTrack.write(38, Buffer.fromHex("00ff2f00")); // end tempo track
        finalMIDI = finalMIDI.concat(starterTrack); // add tempo track to final file
        trackArrays.forEach(function (track, trackIndex) {
            finalMIDI = finalMIDI.concat(track); // add remaining tracks to final file
        });
        return finalMIDI;
    };

    export function createMIDI(file: Buffer) { // create midi file from assembled midi data
        let trackBufferArray: Buffer[] = [];
        tick480 = true; // set tick rate of midi file to 480 ticks/quarter note
        bpm = file.getNumber(NumberFormat.Int16LE, 1);
        noteVelocity = 90;
        timeSignature = file.getUint8(3);
        tickConstant = tick480 ? 480 / file.getUint8(4) : 1;
        tickRate = tick480 ? 480 : file.getUint8(4) / 4;
        trackAmount = file.getUint8(6);
        let trackData: Buffer[] = getTrackData(file);
        trackData.forEach(function (v, i) {
            trackBufferArray.push(generateTrack(extractEvents(v, i), i)); // line of death. guaranteed arcade crash -2025 <--- lies lies arcade never crashed this aint no 'line of death' -2026
        });
        const midiFile: Buffer = assembleMIDIFile(trackBufferArray);
        console.log(b64output?midiFile.toBase64():midiFile.toHex());
    };
    export let tick480: boolean = true; // set tick rate of midi file to 480 ticks/quarter note
    let bpm: uint16;
    let isPercussion: boolean = false;
    let noteVelocity: uint8;
    let timeSignature: uint8;
    let tickConstant: number;
    let tickRate: uint16;
    let trackAmount: uint8;
    export let b64output: boolean = false;
}