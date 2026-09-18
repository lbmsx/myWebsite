const mainStartBtn = document.getElementById("mainStartBtn");
const floatBar = document.getElementById("floatBar");
const micBtn = document.getElementById("micBtn");
const recCtrlBtn = document.getElementById("recCtrlBtn");
const closeFloatBtn = document.getElementById("closeFloatBtn");
const statusText = document.getElementById("statusText");

let screenStream = null;
let micStream = null;
let combinedStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let micOn = true;
let hasMicDevice = false;

// WebAudio混音变量（系统音频+麦克风）
let audioContext = null;
let audioDestination = null;

// ===== 主页面按钮：唤起屏幕共享（开启audio:true支持系统音频） =====
mainStartBtn.onclick = async () => {
    mainStartBtn.disabled = true;
    statusText.textContent = "正在请求屏幕共享权限...";
    try {
        // 请求屏幕共享，audio:true 使Windows Chrome/Edge出现【共享系统音频】复选框
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always"
            },
            audio: true
        });
        statusText.textContent = "屏幕共享已授权，正在尝试获取麦克风...";

        // 第二步：尝试获取麦克风（可选，失败不中断）
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            hasMicDevice = true;
            micOn = true;
        } catch (micErr) {
            console.warn("未找到麦克风设备或麦克风被拒绝", micErr);
            micStream = null;
            hasMicDevice = false;
            micBtn.disabled = true;
            micBtn.style.opacity = "0.4";
            statusText.textContent = "未检测到麦克风，可录制画面+系统音频";
        }

        // -------- WebAudio混音：系统屏幕音频 + 麦克风音频 --------
        audioContext = new AudioContext();
        audioDestination = audioContext.createMediaStreamDestination();

        // 添加屏幕系统音频轨道（用户勾选共享系统音频才会存在）
        const screenAudioTracks = screenStream.getAudioTracks();
        if (screenAudioTracks.length > 0) {
            const screenAudioSource = audioContext.createMediaStreamSource(new MediaStream(screenAudioTracks));
            screenAudioSource.connect(audioDestination);
        }

        // 添加麦克风音频轨道
        if (micStream) {
            const micAudioSource = audioContext.createMediaStreamSource(micStream);
            micAudioSource.connect(audioDestination);
        }

        // 组装最终流：屏幕视频 + 混音后的音频轨道
        const videoTrack = screenStream.getVideoTracks()[0];
        const mixedAudioTracks = audioDestination.stream.getAudioTracks();
        combinedStream = new MediaStream([videoTrack, ...mixedAudioTracks]);

        // 显示悬浮条
        floatBar.style.display = "flex";
        statusText.textContent = "";

        // 监听浏览器"停止共享"按钮
        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
            closeFloatBar();
        });

    } catch (err) {
        console.error("错误:", err);
        statusText.textContent = "错误：" + (err.message || "屏幕共享授权失败");
        mainStartBtn.disabled = false;
    }
};

// ===== 麦克风开关（仅控制麦克风，不控制系统音频） =====
micBtn.onclick = () => {
    if (!hasMicDevice || !micStream) return;
    micOn = !micOn;
    const audioTrack = micStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = micOn;
    }
    if (micOn) {
        micBtn.classList.remove("muted");
        const slash = micBtn.querySelector(".mic-slash");
        if (slash) slash.remove();
    } else {
        micBtn.classList.add("muted");
        const slash = document.createElement("div");
        slash.className = "mic-slash";
        micBtn.appendChild(slash);
    }
};

// ===== 录制/停止按钮 =====
recCtrlBtn.onclick = () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
};

function startRecording() {
    recordedChunks = [];
    const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4"
    ];
    let selectedMimeType = "";
    for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
            selectedMimeType = mt;
            break;
        }
    }
    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
    try {
        mediaRecorder = new MediaRecorder(combinedStream, options);
    } catch (e) {
        mediaRecorder = new MediaRecorder(combinedStream);
    }
    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };
    mediaRecorder.onstop = () => {
        const blobType = mediaRecorder.mimeType || "video/webm";
        const blob = new Blob(recordedChunks, { type: blobType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = blobType.includes("mp4") ? "mp4" : "webm";
        const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.download = `屏幕录制_${date}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        statusText.textContent = "录制已保存到下载文件夹";
    };
    mediaRecorder.start(1000);
    isRecording = true;
    recCtrlBtn.textContent = "结束录制";
    recCtrlBtn.classList.remove("green");
    recCtrlBtn.classList.add("red");
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    isRecording = false;
    recCtrlBtn.textContent = "开始录制";
    recCtrlBtn.classList.remove("red");
    recCtrlBtn.classList.add("green");
    setTimeout(() => {
        closeFloatBar();
    }, 500);
}

// ===== 关闭悬浮条，释放全部资源（包含AudioContext） =====
closeFloatBtn.onclick = closeFloatBar;
function closeFloatBar() {
    floatBar.style.display = "none";
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }
    // 关闭音频上下文释放混音资源
    if(audioContext) {
        audioContext.close().catch(e=>{});
    }

    screenStream = null;
    micStream = null;
    combinedStream = null;
    mediaRecorder = null;
    audioContext = null;
    audioDestination = null;
    isRecording = false;
    hasMicDevice = false;

    // 重置麦克风按钮
    micBtn.disabled = false;
    micBtn.style.opacity = "1";
    micBtn.classList.remove("muted");
    const slash = micBtn.querySelector(".mic-slash");
    if (slash) slash.remove();

    recCtrlBtn.textContent = "开始录制";
    recCtrlBtn.classList.remove("red");
    recCtrlBtn.classList.add("green");
    mainStartBtn.disabled = false;
}

// ===== 悬浮窗拖拽功能（完全原样保留） =====
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

floatBar.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    isDragging = true;
    const rect = floatBar.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    floatBar.style.transform = "none";
    floatBar.style.left = rect.left + "px";
    floatBar.style.top = rect.top + "px";
    floatBar.style.bottom = "auto";
});
document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    let newLeft = e.clientX - dragOffsetX;
    let newTop = e.clientY - dragOffsetY;
    const maxLeft = window.innerWidth - floatBar.offsetWidth;
    const maxTop = window.innerHeight - floatBar.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    floatBar.style.left = newLeft + "px";
    floatBar.style.top = newTop + "px";
});
document.addEventListener("mouseup", () => {
    isDragging = false;
});

// 触屏拖拽支持
floatBar.addEventListener("touchstart", (e) => {
    if (e.target.tagName === "BUTTON") return;
    isDragging = true;
    const touch = e.touches[0];
    const rect = floatBar.getBoundingClientRect();
    dragOffsetX = touch.clientX - rect.left;
    dragOffsetY = touch.clientY - rect.top;
    floatBar.style.transform = "none";
    floatBar.style.left = rect.left + "px";
    floatBar.style.top = rect.top + "px";
    floatBar.style.bottom = "auto";
}, { passive: true });
document.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    let newLeft = touch.clientX - dragOffsetX;
    let newTop = touch.clientY - dragOffsetY;
    const maxLeft = window.innerWidth - floatBar.offsetWidth;
    const maxTop = window.innerHeight - floatBar.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    floatBar.style.left = newLeft + "px";
    floatBar.style.top = newTop + "px";
}, { passive: true });
document.addEventListener("touchend", () => {
    isDragging = false;
});
