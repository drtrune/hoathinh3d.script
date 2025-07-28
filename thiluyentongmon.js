// ==UserScript==
// @name         HH3D Thí Luyện Tông Môn
// @namespace    http://tampermonkey.net/
// @version      1.2 // Cập nhật phiên bản
// @description  Tự động click vào class tltm-chest-container trên trang https://hoathinh3d.gg/thi-luyen-tong-mon-hh3d khi cooldown kết thúc. Thêm log UI nổi.
// @author       Bạn
// @match        https://hoathinh3d.gg/thi-luyen-tong-mon*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Lưu các hàm console gốc ngay khi script được parse
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    // --- Biến toàn cục và Hàm tiện ích để quản lý UI Log ---
    let logContainer = null;
    let logContentDiv = null;

    function createUILogger() {
        // Tránh tạo lại UI nếu đã tồn tại
        if (document.getElementById('hh3dThiLuyenLog')) {
            logContainer = document.getElementById('hh3dThiLuyenLog');
            logContentDiv = logContainer.querySelector('.log-content');
            return;
        }

        // Tạo container chính cho log
        logContainer = document.createElement('div');
        logContainer.id = 'hh3dThiLuyenLog';
        Object.assign(logContainer.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '350px',
            maxHeight: '400px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#00ff00', // Màu xanh lá cây cho log
            border: '1px solid #00ff00',
            borderRadius: '8px',
            zIndex: '99999',
            fontFamily: 'monospace',
            fontSize: '12px',
            overflow: 'hidden', // Để scrollbar chỉ xuất hiện ở phần nội dung
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column'
        });

        // Tạo header với tiêu đề và nút đóng
        const logHeader = document.createElement('div');
        Object.assign(logHeader.style, {
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            borderBottom: '1px solid #00ff00',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move', // Cho phép kéo
            color: '#00ff00'
        });
        logHeader.textContent = 'HH3D Thí Luyện Log';

        const closeButton = document.createElement('button');
        closeButton.textContent = 'X';
        Object.assign(closeButton.style, {
            background: 'none',
            border: 'none',
            color: '#00ff00',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
        });
        closeButton.onclick = () => {
            logContainer.style.display = 'none';
        };
        logHeader.appendChild(closeButton);
        logContainer.appendChild(logHeader);

        // Tạo phần nội dung log
        logContentDiv = document.createElement('div');
        logContentDiv.classList.add('log-content'); // Thêm class để dễ tìm kiếm
        Object.assign(logContentDiv.style, {
            flexGrow: '1', // Cho phép nội dung log chiếm hết không gian còn lại
            padding: '10px',
            overflowY: 'auto', // Thêm scrollbar khi nội dung quá dài
            whiteSpace: 'pre-wrap', // Giữ định dạng xuống dòng và khoảng trắng
            wordBreak: 'break-word' // Ngắt từ nếu quá dài
        });
        logContainer.appendChild(logContentDiv);

        // Tạo footer với các nút chức năng
        const logFooter = document.createElement('div');
        Object.assign(logFooter.style, {
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            borderTop: '1px solid #00ff00',
            display: 'flex',
            justifyContent: 'space-around'
        });

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Log';
        Object.assign(copyButton.style, {
            backgroundColor: '#005500', // Nền xanh đậm
            color: '#00ff00',
            border: '1px solid #00ff00',
            padding: '5px 10px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
        });
        copyButton.onmouseover = (e) => e.target.style.backgroundColor = '#007700';
        copyButton.onmouseout = (e) => e.target.style.backgroundColor = '#005500';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(logContentDiv.textContent)
                .then(() => {
                    logMessage('Log đã được sao chép!', 'info');
                })
                .catch(err => {
                    logMessage('Không thể sao chép log: ' + err, 'error');
                });
        };
        logFooter.appendChild(copyButton);

        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Log';
        Object.assign(clearButton.style, {
            backgroundColor: '#550000', // Nền đỏ đậm
            color: '#ff0000',
            border: '1px solid #ff0000',
            padding: '5px 10px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
        });
        clearButton.onmouseover = (e) => e.target.style.backgroundColor = '#770000';
        clearButton.onmouseout = (e) => e.target.style.backgroundColor = '#550000';
        clearButton.onclick = () => {
            logContentDiv.innerHTML = '';
            logMessage('Log đã được xoá.', 'info');
        };
        logFooter.appendChild(clearButton);
        logContainer.appendChild(logFooter);

        document.body.appendChild(logContainer);

        // Kéo thả hộp log
        let isDragging = false;
        let offsetX, offsetY;

        logHeader.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - logContainer.getBoundingClientRect().left;
            offsetY = e.clientY - logContainer.getBoundingClientRect().top;
            logContainer.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            logContainer.style.left = (e.clientX - offsetX) + 'px';
            logContainer.style.top = (e.clientY - offsetY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            logContainer.style.cursor = 'move';
        });
    }

    function logMessage(message, type = 'log') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        logEntry.style.marginBottom = '2px';

        if (type === 'warn') {
            logEntry.style.color = 'yellow';
        } else if (type === 'error') {
            logEntry.style.color = 'red';
            logEntry.style.fontWeight = 'bold';
        } else if (type === 'info') { // Thêm loại info cho các thông báo của UI
            logEntry.style.color = 'cyan';
        }

        if (logContentDiv) {
            logContentDiv.appendChild(logEntry);
            logContentDiv.scrollTop = logContentDiv.scrollHeight; // Cuộn xuống dưới cùng
        }

        // Vẫn log ra console gốc để tiện debug
        if (type === 'warn') originalConsoleWarn(message);
        else if (type === 'error') originalConsoleError(message);
        else originalConsoleLog(message);
    }

    // Ghi đè console.log/warn/error để chuyển hướng log
    console.log = (message, ...args) => {
        if (typeof message === 'string' && message.startsWith('[HH3D Thi Luyen DEBUG]')) {
            logMessage(message);
        } else {
            originalConsoleLog(message, ...args);
        }
    };
    console.warn = (message, ...args) => {
        if (typeof message === 'string' && message.startsWith('[HH3D Thi Luyen DEBUG]')) {
            logMessage(message, 'warn');
        } else {
            originalConsoleWarn(message, ...args);
        }
    };
    console.error = (message, ...args) => {
        if (typeof message === 'string' && message.startsWith('[HH3D Thi Luyen DEBUG]')) {
            logMessage(message, 'error');
        } else {
            originalConsoleError(message, ...args);
        }
    };

    console.log('[HH3D Thi Luyen DEBUG] SCRIPT INITIALIZED. Starting main check loop...');

    // --- Configuration ---
    const MAIN_CHECK_INTERVAL = 2000; // Every 2 seconds, similar to Tiên Duyên
    const INTER_ACTION_DELAY = 1000;  // 1 second, delay before click

    // --- State flags ---
    let intervalId = null; // ID of the main setInterval
    let isClickingProcessActive = false; // Flag to ensure click process runs only once

    // --- Utility function: sleep ---
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Utility function: safeClick (from Tiên Duyên) ---
    // Adjusted to fit the Thi Luyen click button
    function safeClick(element, elementName = 'element') {
        if (!element) {
            console.error(`[HH3D Thi Luyen DEBUG] ERROR: Cannot click because ${elementName} is null.`);
            return false;
        }
        // Check visibility and enabled conditions before final click
        const isVisible = element.offsetParent !== null;
        const isEnabled = !element.disabled && !element.classList.contains('disabled');

        if (!isVisible || !isEnabled) {
            console.warn(`[HH3D Thi Luyen DEBUG] WARNING: ${elementName} DOES NOT MEET CLICK CONDITIONS (Visible: ${isVisible}, Enabled: ${isEnabled}).`);
            return false;
        }

        try {
            console.log(`[HH3D Thi Luyen DEBUG] Attempting to click ${elementName} using dispatchEvent.`);
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            console.log(`%c[HH3D Thi Luyen DEBUG] Successfully dispatched MouseEvent 'click' for ${elementName}.`, 'color: lightgreen;');
            return true;
        } catch (e) {
            console.warn(`[HH3D Thi Luyen DEBUG] ERROR dispatching MouseEvent for ${elementName}:`, e, "Trying direct click.");
            try {
                element.click();
                console.log(`%c[HH3D Thi Luyen DEBUG] Successfully performed direct click for ${elementName}.`, 'color: lightgreen;');
                return true;
            } catch (e2) {
                console.error(`%c[HH3D Thi Luyen DEBUG] CANNOT CLICK ${elementName} (both methods):`, 'color: red;', e2);
                return false;
            }
        }
    }

    // --- Utility function: Parse cooldown time ---
    function parseCooldownTime(timerElement) {
        if (!timerElement) return 0;
        const timeText = timerElement.textContent.trim();
        const parts = timeText.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) { // HH:MM:SS
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) { // MM:SS
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) { // SS (less common, but for safety)
            seconds = parts[0];
        }
        return seconds;
    }

    // --- Manage auto-click toggle option ---
    const AUTO_CLICK_TOGGLE_KEY = 'hh3dThiLuyenAutoClickEnabled';

    function getAutoClickState() {
        const storedState = localStorage.getItem(AUTO_CLICK_TOGGLE_KEY);
        return storedState === null ? true : JSON.parse(storedState);
    }

    function setAutoClickState(enabled) {
        localStorage.setItem(AUTO_CLICK_TOGGLE_KEY, JSON.stringify(enabled));
        console.log(`[HH3D Thi Luyen DEBUG] Auto-click has been ${enabled ? 'ENABLED' : 'DISABLED'}.`);
        // Update the switch state immediately if UI exists
        const toggleSwitch = document.getElementById('autoClickToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }
    }

    // --- Function to create and inject the toggle UI under the countdown-timer ---
    function createPersistentToggleButtonUI() {
        const toggleContainerId = 'autoThiLuyenToggleContainer';
        let toggleContainer = document.getElementById(toggleContainerId);

        if (toggleContainer) {
            console.log('[HH3D Thi Luyen DEBUG] UI toggle already exists, not recreating.');
            const toggleSwitch = document.getElementById('autoClickToggleSwitch');
            if (toggleSwitch) {
                toggleSwitch.checked = getAutoClickState(); // Update state
            }
            return;
        }

        // Target the countdown-timer element
        const targetElement = document.querySelector('.countdown-timer');
        if (!targetElement) {
            console.log('[HH3D Thi Luyen DEBUG] Countdown-timer not found to inject UI toggle. Waiting for next loop.');
            return;
        }

        console.log('[HH3D Thi Luyen DEBUG] Found countdown-timer. Creating and injecting UI toggle.');

        toggleContainer = document.createElement('div');
        toggleContainer.id = toggleContainerId;
        Object.assign(toggleContainer.style, {
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #00ff00',
            borderRadius: '5px',
            padding: '8px 12px',
            marginTop: '10px', // Smaller margin to be closer to the timer
            marginBottom: '10px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#fff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', // Center content within the toggle
            gap: '8px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            width: 'fit-content', // Width fits content
            margin: '10px auto' // Center horizontally and add vertical margin
        });

        const label = document.createElement('span');
        label.textContent = 'Tự động click Thí Luyện:';
        label.style.color = '#fff';
        toggleContainer.appendChild(label);

        const toggleSwitch = document.createElement('input');
        toggleSwitch.type = 'checkbox';
        toggleSwitch.id = 'autoClickToggleSwitch';
        toggleSwitch.checked = getAutoClickState(); // Get state from localStorage

        Object.assign(toggleSwitch.style, {
            width: '22px',
            height: '22px',
            cursor: 'pointer',
            verticalAlign: 'middle'
        });

        toggleSwitch.addEventListener('change', (event) => {
            setAutoClickState(event.target.checked);
        });
        toggleContainer.appendChild(toggleSwitch);

        // Insert toggleContainer right after the target element (countdown-timer)
        targetElement.after(toggleContainer);
        console.log('[HH3D Thi Luyen DEBUG] UI toggle successfully injected.');
    }

    // --- Main script stop function ---
    function stopAutoClick() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('%c[HH3D Thi Luyen DEBUG] SCRIPT STOPPED: Task completed or manually stopped.', 'color: #1a73e8; font-weight: bold;');
        } else {
            console.log('[HH3D Thi Luyen DEBUG] Script is already stopped.');
        }
        // Ẩn UI log khi script dừng
        if (logContainer) {
            logContainer.style.display = 'none';
        }
    }

    // --- Function to check status and perform chest click ---
    async function checkAndClickChest() {
        if (isClickingProcessActive) {
            console.log('[HH3D Thi Luyen DEBUG] Click process is active. Skipping.');
            return;
        }

        if (!getAutoClickState()) {
            console.log('[HH3D Thi Luyen DEBUG] Auto-click is DISABLED by user option. Skipping click.');
            return;
        }

        const chestButton = document.querySelector('.tltm-chest-container');
        const cooldownTimer = document.querySelector('.countdown-timer');

        if (chestButton) {
            const isVisible = chestButton.offsetParent !== null;
            const isEnabled = !chestButton.disabled && !chestButton.classList.contains('disabled');

            if (cooldownTimer && cooldownTimer.offsetParent !== null) {
                // Timer found and visible -> cooldown active
                const remainingSeconds = parseCooldownTime(cooldownTimer);
                if (remainingSeconds > 0) {
                    console.log(`[HH3D Thi Luyen DEBUG] Button is on cooldown. Time remaining: ${cooldownTimer.textContent.trim()} (${remainingSeconds} giây).`);
                    // Do nothing, loop will check again later
                } else {
                    // Timer visible but time is 0 or negative -> cooldown might be over but button not updated
                    console.log('[HH3D Thi Luyen DEBUG] Timer visible but time is 0. Waiting for button to be ready.');
                    if (isVisible && isEnabled) {
                        console.log('[HH3D Thi Luyen DEBUG] "Thi Luyen" button is ready to click. Starting click process.');
                        isClickingProcessActive = true;
                        await sleep(INTER_ACTION_DELAY); // Wait 1 second before clicking

                        if (safeClick(chestButton, 'nút "Thí Luyện"')) {
                            console.log('%c[HH3D Thi Luyen DEBUG] SUCCESSFULLY CLICKED "Thi Luyen" button! Stopping script.', 'color: purple; font-weight: bold;');
                            stopAutoClick();
                        } else {
                            console.warn('[HH3D Thi Luyen DEBUG] Could not click "Thi Luyen" button despite being found. Stopping script.');
                            stopAutoClick(); // Stop script if click fails
                        }
                    } else {
                        console.log(`[HH3D Thi Luyen DEBUG] "Thi Luyen" button not ready (Visible: ${isVisible}, Enabled: ${isEnabled}). Continuing to wait.`);
                    }
                }
            } else {
                // No timer found or timer not visible -> assume no cooldown
                console.log('[HH3D Thi Luyen DEBUG] No cooldown timer found or timer not visible. Checking button.');
                if (isVisible && isEnabled) {
                    console.log('[HH3D Thi Luyen DEBUG] "Thi Luyen" button is ready to click. Starting click process.');
                    isClickingProcessActive = true;
                    await sleep(INTER_ACTION_DELAY); // Wait 1 second before clicking

                    if (safeClick(chestButton, 'nút "Thí Luyện"')) {
                        console.log('%c[HH3D Thi Luyen DEBUG] SUCCESSFULLY CLICKED "Thi Luyen" button! Stopping script.', 'color: purple; font-weight: bold;');
                        stopAutoClick();
                    } else {
                        console.warn('[HH3D Thi Luyen DEBUG] Could not click "Thi Luyen" button despite being found. Stopping script.');
                        stopAutoClick(); // Stop script if click fails
                    }
                } else {
                    console.log(`[HH3D Thi Luyen DEBUG] "Thi Luyen" button not ready (Visible: ${isVisible}, Enabled: ${isEnabled}). Continuing to wait.`);
                }
            }
        } else {
            console.log('[HH3D Thi Luyen DEBUG] "tltm-chest-container" button not found. Continuing to wait.');
        }
    }

    // --- Main script loop (similar to Tiên Duyên's mainLoopCheck) ---
    async function mainLoop() {
        console.log(`[HH3D Thi Luyen DEBUG] Main loop check: ${new Date().toLocaleTimeString()}`);
        createPersistentToggleButtonUI(); // Ensure UI is always created/updated
        await checkAndClickChest();       // Check and perform click
    }

    // --- Start the main loop ---
    function startMainLoop() {
        if (intervalId === null) {
            console.log('[HH3D Thi Luyen DEBUG] Starting main check loop.');
            mainLoop(); // Run first time immediately
            intervalId = setInterval(mainLoop, MAIN_CHECK_INTERVAL);
        } else {
            console.log('[HH3D Thi Luyen DEBUG] Main check loop is already running.');
        }
    }

    // Start the loop using multiple methods to ensure it runs
    startMainLoop(); // Run immediately

    window.addEventListener('DOMContentLoaded', () => {
        console.log('[HH3D Thi Luyen DEBUG] DOMContentLoaded activated. Re-checking loop start.');
        startMainLoop();
    });

    window.addEventListener('load', () => {
        console.log('[HH3D Thi Luyen DEBUG] window.load activated. Re-checking loop start.');
        startMainLoop();
    });

    // Expose stop function to global scope for console access
    window.stopAutoThiLuyenScript = stopAutoClick;

})();

