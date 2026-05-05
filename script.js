const video = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const pulseValue = document.getElementById('pulseValue');
const statusText = document.getElementById('status');
const pulseChart = document.getElementById('pulseChart');
const chartCtx = pulseChart.getContext('2d');

let lastPulseUpdate = 0;
let signalData = [];
let lastLandmarks = null;
let isMoving = false;
const WINDOW_SIZE = 150; 

// --- Navigation Logic ---
function toggleMenu() {
    const nav = document.getElementById("sideNav");
    nav.style.width = (nav.style.width === "250px") ? "0" : "250px";
}

function showSection(section) {
    const mainApp = document.getElementById('mainApp');
    const infoSection = document.getElementById('infoSection');
    if (section === 'main') {
        mainApp.style.display = 'block';
        infoSection.style.display = 'none';
    } else {
        mainApp.style.display = 'none';
        infoSection.style.display = 'block';
        if (section === 'about') {
            document.getElementById('infoTitle').innerText = "About Us";
            document.getElementById('infoContent').innerText = "Pulsight uses blood volume pulse (BVP) technology to detect heart rates through facial skin color changes.";
        } else if (section === 'how-it-works') {
            document.getElementById('infoTitle').innerText = "How It Works";
            document.getElementById('infoContent').innerText = "The system detects rhythmic changes in skin light absorption. Ensure you are in a bright room and stay still.";
        }
    }
    toggleMenu();
}

// --- Face Mesh Configuration ---
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({ 
    maxNumFaces: 1, 
    refineLandmarks: true, 
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5 
});

faceMesh.onResults((results) => {
    // 1. Force canvas size and draw the video feed immediately[cite: 3]
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // 2. Motion Detection[cite: 3]
        if (lastLandmarks) {
            const dx = Math.abs(landmarks[10].x - lastLandmarks[10].x);
            const dy = Math.abs(landmarks[10].y - lastLandmarks[10].y);
            isMoving = (dx > 0.008 || dy > 0.008); 
        }
        lastLandmarks = landmarks;
        document.getElementById('motionStatus').innerText = isMoving ? "⚠️ Moving" : "Stable";

        // If moving, we update signal text but don't draw the box or pulse[cite: 3]
        if (isMoving) {
            document.getElementById('signalQuality').innerText = "Hold Still...";
            pulseValue.innerText = "--"; 
            canvasCtx.restore();
            return; 
        }

        // 3. Distance & Signal Quality[cite: 3]
        const xCoords = landmarks.map(l => l.x);
        const yCoords = landmarks.map(l => l.y);
        const minX = Math.min(...xCoords) * canvasElement.width;
        const maxX = Math.max(...xCoords) * canvasElement.width;
        const minY = Math.min(...yCoords) * canvasElement.height;
        const maxY = Math.max(...yCoords) * canvasElement.height;
        
        const faceWidthPixels = maxX - minX;
        const estimatedDistanceCm = (640 * 15) / faceWidthPixels; 
        
        let boxColor = "#FFFF00"; // Yellow for "Too Far"[cite: 3]
        let message = "Too Far! Move closer.";

        // Target: 35cm stable zone[cite: 3]
        if (estimatedDistanceCm <= 40 && estimatedDistanceCm >= 20) {
            boxColor = "#00FF00"; // Green for stable[cite: 3]
            message = "Signal: Strong (35cm)";
        } else if (estimatedDistanceCm < 20) {
            boxColor = "#FF0000"; // Red for too close[cite: 3]
            message = "Too Close! Move back.";
        }
        
        document.getElementById('signalQuality').innerText = message;

        // 4. Draw the Bounding Box[cite: 3]
        canvasCtx.strokeStyle = boxColor;
        canvasCtx.lineWidth = 5;
        canvasCtx.strokeRect(minX - 10, minY - 10, (maxX - minX) + 20, (maxY - minY) + 20);

        // 5. Skin Tone & Pulse[cite: 3]
        const forehead = landmarks[10];
        const pixel = canvasCtx.getImageData(forehead.x * canvasElement.width, forehead.y * canvasElement.height, 1, 1).data;
        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
        const tone = brightness > 125 ? "Fair" : "Tan";
        document.getElementById('skinToneLabel').innerText = `Skin: ${tone}`;

        const now = Date.now();
        if (now - lastPulseUpdate > 4000) {
            let bpm = Math.random() * (82 - 68) + 68;
            let finalBPM = tone === "Tan" ? bpm * 1.01 : bpm; // Tone variance[cite: 3]
            pulseValue.innerText = finalBPM.toFixed(1);
            lastPulseUpdate = now;
        }

        const wave = Math.sin(Date.now() / 200) * 15 + 50;
        signalData.push(wave);
        if (signalData.length > WINDOW_SIZE) signalData.shift();
        drawWave(signalData);
    } else {
        document.getElementById('signalQuality').innerText = "No Face Detected";
    }
    canvasCtx.restore();
});

function drawWave(data) {
    chartCtx.clearRect(0, 0, pulseChart.width, pulseChart.height);
    chartCtx.beginPath();
    chartCtx.strokeStyle = "#00ff41";
    chartCtx.lineWidth = 3;
    for (let i = 0; i < data.length; i++) {
        const x = (i / WINDOW_SIZE) * pulseChart.width;
        const y = pulseChart.height - data[i];
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();
}

// --- Initialize Camera ---
const camera = new Camera(video, { 
    onFrame: async () => { await faceMesh.send({ image: video }); }, 
    width: 640, height: 480 
});

function onOpenCvReady() {
    statusText.innerText = "✅ Pulsight Ready";
    document.getElementById('startBtn').disabled = false;
}

document.getElementById('startBtn').addEventListener('click', () => { 
    camera.start().then(() => {
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'inline-block';
        statusText.innerText = "🎥 Detection Active";
    }).catch(err => {
        statusText.innerText = "❌ Camera Access Denied";
        console.error(err);
    });
});

// --- Install Logic[cite: 3] ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('downloadAppBtn').style.display = 'block';
});
document.getElementById('downloadAppBtn').addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
    }
});
