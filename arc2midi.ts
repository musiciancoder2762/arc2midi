// convert arcade songs into midi
namespace arc2MIDI {
    function int2vlq(int: number) {
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

    function calculateBitLength(val: number) {
        if (val === 0) {
            return 1;
        } else {
            return Math.floor(Math.log(Math.abs(val)))/Math.log(2);
        }
    };

    function getTrackData(file: Buffer) {
        let byteInd: number = 7;
        let trackArray: Buffer[] = [];
        for (let trk = 0; trk < trackAmount; trk++) {
            trackArray.push(file.slice(byteInd, file.getNumber(NumberFormat.UInt16LE, byteInd + 32) + 34));
            byteInd += file.getNumber(NumberFormat.UInt16LE,byteInd+32)+34;
        }
        return trackArray;
    };

    function convertArcNotetoMIDINote(note: number, octave: number) {
        return (note&63) + (12 * octave) - 1;
    };

    function extractEvents(track: Buffer, channelNo: number) {
        let cleanTrk: Buffer = track.slice(34);
        let instrumentOctave: number = track.getUint8(31);
        let events: number[][] = [];
        let deltaEvents: number[] = [];
        let deltaInd: number = 0;
        let byteIndex: number = 0;
        let noteAmount: number = 1;
        if (channelNo>15) {channelNo = 15};
        if (channelNo===9) {channelNo = 10}; // channel 0xn9 (channel 10) is reserved for percussion
        if (noteVelocity > 0x7f) { noteVelocity = 0x7f; };
        while (byteIndex < cleanTrk.length) {
            noteAmount = 0;
            while (noteAmount < cleanTrk.getUint8(byteIndex+4)) {
                events.push([cleanTrk.getNumber(NumberFormat.UInt16LE, 0 + byteIndex) * (tick480 ? tickConstant : 1), 0x90 + channelNo, convertArcNotetoMIDINote(cleanTrk.getUint8(noteAmount + byteIndex + 5), instrumentOctave), noteVelocity]);
                events.push([cleanTrk.getNumber(NumberFormat.UInt16LE, 2 + byteIndex) * (tick480 ? tickConstant : 1), 0x80 + channelNo, convertArcNotetoMIDINote(cleanTrk.getUint8(noteAmount + byteIndex + 5), instrumentOctave), 0]);
                noteAmount++;
            }
            byteIndex += (5 + cleanTrk.getUint8(byteIndex + 4));
        }
        events.sort((a,b) => {
            return a[0] - b[0];
        });
        deltaEvents.push(events[0][0]);
        while (deltaInd < events.length-1) {
            deltaEvents.push(events[deltaInd + 1][0] - events[deltaInd ][0]);
            deltaInd++;
        }
        deltaInd = 0;
        while (deltaInd < events.length) {
            events[deltaInd][0]=deltaEvents[deltaInd];
            deltaInd++;
        }
        return events;
    };

    function generateTrack(events: number[][], trackNumber?: number,) {
        if (trackNumber === undefined) {trackNumber = 0;};
        let trackBuffer: Buffer = Buffer.create(23);
        let eventBuffer: Buffer = Buffer.create(0);
        trackBuffer.write(0,Buffer.fromUTF8("MTrk")); // midi header
        trackBuffer.write(8,Buffer.fromHex("00ff0308")); // declare track name
        trackBuffer.write(12, Buffer.fromUTF8(`TRACK ${trackNumber < 10 ? `0${trackNumber}` : trackNumber}`)); // set track name
        trackBuffer.write(20,Buffer.fromHex("00c000")); // set instrument to piano
        events.forEach(function(value,index) {
            int2vlq(value[0]).forEach(function(v,i) {
                eventBuffer = eventBuffer.concat(Buffer.fromArray([v]));
            });
            eventBuffer = eventBuffer.concat(Buffer.fromArray([value[1],value[2],value[3]]));
            trackBuffer = trackBuffer.concat(eventBuffer);
            eventBuffer = Buffer.create(0);
        });
        trackBuffer = trackBuffer.concat(Buffer.fromHex("00ff2f00"));
        trackBuffer.setNumber(NumberFormat.UInt32BE,4,trackBuffer.length-8);
        return trackBuffer;
    };

    function assembleMIDIFile(trackArrays: Buffer[]) {
        let finalMIDI: Buffer = Buffer.create(14);
        let starterTrack: Buffer = Buffer.create(42);

        finalMIDI.write(0,Buffer.fromUTF8("MThd"));
        finalMIDI.setUint8(7,6);
        finalMIDI.setUint8(9,1);
        finalMIDI.setNumber(NumberFormat.UInt16BE,10,trackAmount+1);
        finalMIDI.setNumber(NumberFormat.UInt16BE,12,tick480?480:tickRate);
        starterTrack.write(0,Buffer.fromUTF8("MTrk"));
        starterTrack.setUint8(7,34);
        starterTrack.write(8,Buffer.fromHex("00ff030b"));
        starterTrack.write(12,Buffer.fromUTF8("TEMPO TRACK"));
        starterTrack.write(23,Buffer.fromHex("00ff5804aa041808"));
        starterTrack.setUint8(27,timeSignature);
        starterTrack.write(31,Buffer.fromHex("00ff5103aabbcc"));
        starterTrack.setNumber(NumberFormat.UInt32BE,34,(60/bpm)*1000000);
        starterTrack.setUint8(34,3);
        starterTrack.write(38,Buffer.fromHex("00ff2f00"));
        finalMIDI = finalMIDI.concat(starterTrack);
        trackArrays.forEach(function(track,trackIndex) {
            finalMIDI = finalMIDI.concat(track);
        });
        return finalMIDI;
    };

    export function createMIDI(file: Buffer) {
        let trackBufferArray: Buffer[] = [];
        tick480 = true; // set tick rate of midi file to 480 ticks/quarter note
        bpm = file.getNumber(NumberFormat.Int16LE, 1);
        noteVelocity = 90;
        timeSignature = file.getUint8(3);
        tickConstant = tick480 ? 480 / file.getUint8(4) : 1;
        tickRate = tick480?480:file.getUint8(4)/4;
        trackAmount = file.getUint8(6);
        let trackData: Buffer[] = getTrackData(file);
        trackData.forEach(function(v,i) {
            trackBufferArray.push(generateTrack(extractEvents(v,i),i)); // line of death. guaranteed arcade crash
        });
        console.log(b64output ? assembleMIDIFile(trackBufferArray).toBase64() : assembleMIDIFile(trackBufferArray).toHex());
    };
    export let tick480: boolean = true; // set tick rate of midi file to 480 ticks/quarter note
    let bpm: uint16;
    let noteVelocity: uint8;
    let timeSignature: uint8;
    let tickConstant: number;
    let tickRate: uint16;
    let trackAmount: uint8;
    export let b64output: boolean = true;
}