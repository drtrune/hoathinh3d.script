// ==UserScript==
// @name         HH3D Luận Võ Đường
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      2.4
// @description  Tự động gia nhập trận đấu, bật auto-accept, nhận thưởng và rút ngắn thời gian chờ trong Luận Võ Đường
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/luan-vo-duong*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[HH3D LVD] Script đã tải.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // CẤU HÌNH BIẾN TOÀN CỤC & THỜI GIAN
    // ===============================================

    const TIMEOUT_ELEMENT_STABLE = 5000;
    const DELAY_BEFORE_CLICK = 500;
    const PRIMARY_CHECK_RETRIES = 5;
    const DELAY_BETWEEN_RETRIES = 200;

    const SPEED_MODE_NORMAL = 0;
    const SPEED_MODE_MEDIUM = 1;
    const SPEED_MODE_FAST = 2;

    const DELAY_SETTIMEOUT_NORMAL = 3000;
    const DELAY_SETTIMEOUT_MEDIUM = 1000;
    const DELAY_SETTIMEOUT_FAST = 200;

    const INTERVAL_DELAY_NORMAL = 1000;
    const INTERVAL_DELAY_MEDIUM = 600;
    const INTERVAL_DELAY_FAST = 200;

    let speedUpMode = parseInt(localStorage.getItem('hh3d_lvd_speed_mode') || SPEED_MODE_NORMAL);
    let hasInitializedMainFlow = false;
    let isProcessing = false;

    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = 500) {
        let startTime = Date.now();
        let intervalId;

        intervalId = setInterval(() => {
            const foundElement = document.querySelector(selector);
            const elapsedTime = Date.now() - startTime;

            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                clearInterval(intervalId);
                callback(foundElement);
            } else if (elapsedTime >= timeout) {
                clearInterval(intervalId);
                callback(null);
            }
        }, interval);
    }

    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            console.error(`%c[LVD - LỖI] "${elementName}" là NULL hoặc UNDEFINED.`, 'color: red;');
            return false;
        }
        if (element.disabled) {
            console.warn(`%c[LVD - CẢNH BÁO] "${elementName}" bị DISABLED.`, 'color: orange;');
            return false;
        }
        if (element.offsetParent === null) {
            console.warn(`%c[LVD - CẢNH BÁO] "${elementName}" không hiển thị.`, 'color: orange;');
            return false;
        }

        try {
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            console.log(`%c[LVD - INFO] Đã click "%s".`, 'color: lightblue;', elementName);
            return true;
        } catch (e) {
            console.error(`%c[LVD - LỖI] KHÔNG THỂ CLICK "%s": %o`, 'color: red;', elementName, e);
            return false;
        }
    }

    // ===============================================
    // HÀM TIỆN ÍCH UI (CHO SLIDER SPEED UP)
    // ===============================================

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function createSpeedUpSliderUI() {
        // (Function body remains unchanged)
        addStyle(`
            /* Style code for the slider */
            .slider-control-container {
                position: relative;
                width: 100%;
                height: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .speed-up-slider-container {
                margin-top: 15px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 5px;
                color: #bbb;
                font-size: 14px;
                user-select: none;
                width: 100%;
                max-width: 320px;
                margin-left: auto;
                margin-right: auto;
                padding: 10px;
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.3);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            }
            .speed-up-slider-container label {
                margin-bottom: 5px;
                font-weight: bold;
                color: #f0f0f0;
            }
            .slider-row {
                width: 95%;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .label-wrapper {
                min-width: 80px;
                text-align: center;
            }
            .speed-up-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 2px;
                background: transparent;
                outline: none;
                opacity: 0.9;
                position: absolute;
                z-index: 2;
                cursor: pointer;
            }
            .speed-up-slider:hover {
                opacity: 1;
            }
            .speed-up-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #fff;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
                border: 2px solid #28a745;
                transition: background .2s, border .2s;
            }
            .speed-up-slider::-webkit-slider-thumb:hover {
                background: #f0f0f0;
                border-color: #0056b3;
            }
            .speed-up-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #fff;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
                border: 2px solid #28a745;
                transition: background .2s, border .2s;
            }
            .speed-up-slider::-moz-range-thumb:hover {
                background: #f0f0f0;
                border-color: #0056b3;
            }
            .indicators {
                position: absolute;
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: calc(100% - 8px);
                height: 2px;
                background-color: #888;
                left: 4px;
                z-index: 1;
            }
            .indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #bbb;
                transition: background-color 0.3s;
            }
        `);
        const targetElementSelector = '.auto-accept-label';
        waitForElementStable(targetElementSelector, (targetElement) => {
            if (targetElement) {
                const container = document.createElement('div');
                container.className = 'speed-up-slider-container';
                const labelText = document.createElement('label');
                labelText.textContent = 'Chế độ Khiêu chiến nhanh';
                labelText.htmlFor = 'speedUpSlider';
                const sliderRow = document.createElement('div');
                sliderRow.className = 'slider-row';
                const normalLabelWrapper = document.createElement('div');
                normalLabelWrapper.className = 'label-wrapper';
                const normalLabel = document.createElement('span');
                normalLabel.textContent = 'Bình thường';
                normalLabelWrapper.appendChild(normalLabel);
                const fastLabelWrapper = document.createElement('div');
                fastLabelWrapper.className = 'label-wrapper';
                const fastLabel = document.createElement('span');
                fastLabel.textContent = 'Nhanh';
                fastLabelWrapper.appendChild(fastLabel);
                const sliderControlContainer = document.createElement('div');
                sliderControlContainer.className = 'slider-control-container';
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.id = 'speedUpSlider';
                slider.className = 'speed-up-slider';
                slider.min = SPEED_MODE_NORMAL;
                slider.max = SPEED_MODE_FAST;
                slider.step = 1;
                slider.value = speedUpMode;
                const indicators = document.createElement('div');
                indicators.className = 'indicators';
                const indicatorDots = [];
                for (let i = 0; i < 3; i++) {
                    const indicator = document.createElement('div');
                    indicator.className = 'indicator';
                    indicator.id = `speedUpDot${i}`;
                    indicators.appendChild(indicator);
                    indicatorDots.push(indicator);
                }
                function updateIndicators() {
                    const value = parseInt(slider.value, 10);
                    indicatorDots.forEach((dot, index) => {
                        dot.style.backgroundColor = (index === value) ? "#28a745" : "#bbb";
                    });
                }
                slider.addEventListener('input', (e) => {
                    speedUpMode = parseInt(e.target.value);
                    localStorage.setItem('hh3d_lvd_speed_mode', speedUpMode.toString());
                    const modeNames = ['Bình thường', 'Nhanh vừa', 'Nhanh tối đa'];
                    console.log(`%c[LVD - INFO] Chế độ "Khiêu chiến nhanh": ${modeNames[speedUpMode]}.`, 'color: #8A2BE2;');
                    updateIndicators();
                });
                sliderControlContainer.appendChild(indicators);
                sliderControlContainer.appendChild(slider);
                sliderRow.appendChild(normalLabelWrapper);
                sliderRow.appendChild(sliderControlContainer);
                sliderRow.appendChild(fastLabelWrapper);
                container.appendChild(labelText);
                container.appendChild(sliderRow);
                targetElement.parentNode.insertBefore(container, targetElement.nextSibling);
                console.log('%c[LVD - INFO] Đã chèn Slider "Khiêu chiến nhanh".', 'color: lightgreen;');
                isUISliderCreated = true;
                updateIndicators();
            } else {
                console.warn('%c[LVD - CẢNH BÁO] Không tìm thấy ".auto-accept-label" để chèn slider.', 'color: orange;');
            }
        }, 10000);
    }

    // ===============================================
    // HÀM XỬ LÝ CAN THIỆP THỜI GIAN
    // ===============================================

    window.setTimeout = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;
        if (speedUpMode !== SPEED_MODE_NORMAL && delay === DELAY_SETTIMEOUT_NORMAL && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('o("timer")') && callbackString.includes('delete e.timeout')) {
                const stack = new Error().stack;
                if (stack && stack.includes('sweetalert2.min.js')) {
                    if (speedUpMode === SPEED_MODE_MEDIUM) {
                        actualDelay = DELAY_SETTIMEOUT_MEDIUM;
                    } else if (speedUpMode === SPEED_MODE_FAST) {
                        actualDelay = DELAY_SETTIMEOUT_FAST;
                    }
                    intervened = true;
                }
            }
        }
        if (intervened) {
            console.log(`%c[LVD - SPEED UP] Rút ngắn delay từ ${delay}ms xuống ${actualDelay}ms (chế độ: ${speedUpMode}).`, 'color: #FFA500;');
        }
        return originalSetTimeout(callback, actualDelay, ...args);
    };

    window.setInterval = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;
        if (speedUpMode !== SPEED_MODE_NORMAL && delay === INTERVAL_DELAY_NORMAL && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('--y>0?') && callbackString.includes('clearInterval(window.countdownInterval)') && callbackString.includes('t()')) {
                 const stack = new Error().stack;
                 if (stack && stack.includes('luan-vo.min.js')) {
                    if (speedUpMode === SPEED_MODE_MEDIUM) {
                        actualDelay = INTERVAL_DELAY_MEDIUM;
                    } else if (speedUpMode === SPEED_MODE_FAST) {
                        actualDelay = INTERVAL_DELAY_FAST;
                    }
                    intervened = true;
                 }
            }
        }
        if (intervened) {
            console.log(`%c[LVD - SPEED UP] Tăng tốc interval từ ${delay}ms xuống ${actualDelay}ms (chế độ: ${speedUpMode}).`, 'color: #FFA500;');
        }
        return originalSetInterval(callback, actualDelay, ...args);
    };

    // ===============================================
    // LOGIC CHÍNH CỦA TỰ ĐỘNG HÓA LUẬN VÕ (MỚI)
    // ===============================================

    // Selectors for key elements
    const rewardButtonSelector = 'button#receive-reward-btn.pushable.front';
    const joinButtonSelector = 'img#joinBattleImg.clickable-image[src="/wp-content/themes/halimmovies-child/assets/image/gif/vao-tham-chien.gif"]';
    const autoAcceptToggleSelector = 'input[type="checkbox"]#auto_accept_toggle';

    function startLuanVoDuongAutomation() {
        if (hasInitializedMainFlow) {
            return;
        }
        hasInitializedMainFlow = true;
        console.log(`%c[HH3D LVD] Bắt đầu chu trình tự động hóa chính.`, 'background: #333; color: #f0f0f0;');
        runPrimaryCheckLoop(0);
    }

    function runPrimaryCheckLoop(retries) {
        if (isProcessing) {
            return;
        }

        const rewardButton = document.querySelector(rewardButtonSelector);
        const joinButton = document.querySelector(joinButtonSelector);

        if (rewardButton && rewardButton.offsetParent !== null && !rewardButton.disabled) {
            isProcessing = true;
            console.log(`%c[LVD - AUTO] Đã tìm thấy nút "Nhận Thưởng". Đang click...`, 'color: limegreen;');
            setTimeout(() => {
                if (safeClick(rewardButton, 'nút "Nhận Thưởng"')) {
                    console.log(`%c[LVD - AUTO] Đã click "Nhận Thưởng". Chờ trang tải lại.`, 'color: limegreen; font-weight: bold;');
                }
                isProcessing = false;
            }, DELAY_BEFORE_CLICK);
            return;
        }

        if (joinButton && joinButton.offsetParent !== null && !joinButton.disabled) {
            isProcessing = true;
            console.log(`%c[LVD - AUTO] Đã tìm thấy nút "Gia Nhập". Đang click...`, 'color: limegreen;');
            setTimeout(() => {
                if (safeClick(joinButton, 'nút "Gia Nhập"')) {
                    console.log(`%c[LVD - AUTO] Đã click "Gia Nhập". Chuyển sang xác nhận.`, 'color: limegreen;');
                    confirmJoinBattle();
                } else {
                    isProcessing = false;
                }
            }, DELAY_BEFORE_CLICK);
            return;
        }

        // If neither button is found, check if we have retries left
        if (retries < PRIMARY_CHECK_RETRIES) {
            setTimeout(() => runPrimaryCheckLoop(retries + 1), DELAY_BETWEEN_RETRIES);
        } else {
            console.log(`%c[LVD - AUTO] Đã kiểm tra %d lần, không tìm thấy nút chính. Chuyển sang bước tiếp theo.`, 'color: grey;', PRIMARY_CHECK_RETRIES);
            tryToggleAutoAccept();
        }
    }

    function confirmJoinBattle() {
        console.log(`%c[LVD - AUTO] Đang tìm nút xác nhận "Tham gia".`, 'color: #FF69B4;');
        const confirmButtonSelector = 'button.swal2-confirm.swal2-styled.swal2-default-outline';

        waitForElementStable(confirmButtonSelector, (confirmButton) => {
            if (confirmButton) {
                console.log(`%c[LVD - AUTO] Đã tìm thấy nút xác nhận "Tham gia". Đang click...`, 'color: lightgreen;');
                setTimeout(() => {
                    if (safeClick(confirmButton, 'nút "Tham gia" (xác nhận)')) {
                        console.log(`%c[LVD - AUTO] Đã click "Tham gia". Chờ trang tải lại.`, 'color: limegreen;');
                    }
                    isProcessing = false;
                }, DELAY_BEFORE_CLICK);
            } else {
                console.warn(`%c[LVD - CẢNH BÁO] Không tìm thấy nút xác nhận "Tham gia".`, 'color: grey;');
                isProcessing = false;
            }
        });
    }

    function tryToggleAutoAccept() {
        if (isProcessing) return;

        isProcessing = true;
        createSpeedUpSliderUI();

        console.log(`%c[LVD - AUTO] Đang tìm công tắc "auto_accept_toggle".`, 'color: #98FB98;');
        const autoAcceptToggle = document.querySelector(autoAcceptToggleSelector);

        if (autoAcceptToggle && autoAcceptToggle.offsetParent !== null) {
            if (!autoAcceptToggle.checked) {
                console.log(`%c[LVD - AUTO] "auto_accept_toggle" CHƯA BẬT. Đang click...`, 'color: lightgreen;');
                setTimeout(() => {
                    safeClick(autoAcceptToggle, 'công tắc "auto_accept_toggle"');
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT.`, 'color: limegreen;');
                    isProcessing = false;
                }, DELAY_BEFORE_CLICK);
            } else {
                console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT SẴN.`, 'color: limegreen;');
                isProcessing = false;
            }
        } else {
            console.log(`%c[LVD - AUTO] Không tìm thấy "auto_accept_toggle".`, 'color: grey;');
            isProcessing = false;
        }
    }


    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    function initializeScript() {
        startLuanVoDuongAutomation();
    }

    console.log('%c[HH3D LVD] Kiểm tra trạng thái document để khởi động logic chính.', 'color: #DA70D6;');
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log(`%c[HH3D LVD] Document sẵn sàng (${document.readyState}). Khởi động tự động hóa.`, 'color: #DA70D6; font-weight: bold;');
        initializeScript();
    } else {
        console.log(`%c[HH3D LVD] Document chưa sẵn sàng (${document.readyState}). Chờ DOMContentLoaded.`, 'color: #DA70D6;');
        window.addEventListener('DOMContentLoaded', () => {
            console.log(`%c[HH3D LVD] DOMContentLoaded kích hoạt. Khởi động tự động hóa.`, 'color: #DA70D6; font-weight: bold;');
            initializeScript();
        });
    }

    console.log('%c[HH3D LVD] Thiết lập ban đầu hoàn tất.', 'color: #8A2BE2;');
})();
