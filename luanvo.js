// ==UserScript==
// @name         HH3D Luận Võ Đường
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      2.3
// @description  Tự động gia nhập trận đấu, bật auto-accept, nhận thưởng và rút ngắn thời gian chờ trong Luận Võ Đường
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/luan-vo-duong*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Log khởi đầu script
    console.log('%c[HH3D LVD] Script đã tải.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // CẤU HÌNH BIẾN TOÀN CỤC & THỜI GIAN
    // ===============================================

    // Cấu hình cho tính năng Auto Join/Accept/Reward
    const TIMEOUT_ELEMENT_STABLE = 5000; // 5 giây: Thời gian tối đa chờ một phần tử xuất hiện ổn định
    const INTERVAL_ELEMENT_STABLE = 500;  // 0.5 giây: Khoảng thời gian giữa các lần kiểm tra phần tử
    const DELAY_BEFORE_CLICK = 500;       // 0.5 giây: Độ trễ trước khi thực hiện click
    const DELAY_AFTER_FUNCTION_CALL = 500; // 0.5 giây: Độ trễ sau khi gọi hàm để UI kịp cập nhật
    const DELAY_BETWEEN_RETRIES_SHORT = 500; // 0.5 giây: Độ trễ ngắn khi thử lại hành động
    const DELAY_BETWEEN_RETRIES_LONG = 1000; // 1 giây: Độ trễ dài hơn khi không tìm thấy phần tử/hàm chính

    // Cấu hình cho tính năng Speed Up (Slider 3 vị trí)
    const SPEED_MODE_NORMAL = 0; // Vị trí 1: Bình thường
    const SPEED_MODE_MEDIUM = 1; // Vị trí 2: Nhanh vừa
    const SPEED_MODE_FAST = 2;   // Vị trí 3: Nhanh tối đa

    // Thời gian cho setTimeout
    const DELAY_SETTIMEOUT_NORMAL = 3000; // Delay gốc của game
    const DELAY_SETTIMEOUT_MEDIUM = 1000;  // Nhanh vừa
    const DELAY_SETTIMEOUT_FAST = 200;    // Nhanh tối đa

    // Thời gian cho setInterval
    const INTERVAL_DELAY_NORMAL = 1000;   // Interval gốc của game
    const INTERVAL_DELAY_MEDIUM = 600;    // Nhanh vừa
    const INTERVAL_DELAY_FAST = 200;      // Nhanh tối đa

    // Biến trạng thái speed up (đọc từ localStorage hoặc mặc định là Bình thường)
    let speedUpMode = parseInt(localStorage.getItem('hh3d_lvd_speed_mode') || SPEED_MODE_NORMAL);

    // Biến để theo dõi trạng thái khởi tạo chính của luồng Auto Join/Accept
    let hasInitializedMainFlow = false;
    // Biến theo dõi trạng thái đã nhận thưởng hoặc không có nút nhận thưởng
    let isRewardClaimedOrHandled = false;
    // Biến đếm số lần thử lại gia nhập
    let joinBattleRetryCount = 0;
    // Lưu trữ các hàm setTimeout/setInterval gốc
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
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
    addStyle(`
        /* Container cha chứa thanh trượt và các chỉ báo */
        .slider-control-container {
            position: relative;
            width: 100%;
            height: 20px; /* Chiều cao cố định để chứa slider và indicators */
            display: flex;
            justify-content: center;
            align-items: center;
        }

        /* Container tổng thể */
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

        /* Hàng chứa thanh trượt và các nhãn */
        .slider-row {
            width: 95%;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        /* Container cho mỗi nhãn (để căn giữa) */
        .label-wrapper {
            min-width: 80px;
            text-align: center;
        }

        /* Thanh trượt */
        .speed-up-slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%; /* Đặt chiều rộng tuyệt đối */
            height: 2px;
            background: transparent; /* Ẩn background mặc định */
            outline: none;
            opacity: 0.9;
            position: absolute;
            z-index: 2;
            cursor: pointer;
        }
        .speed-up-slider:hover {
            opacity: 1;
        }
        /* Thiết kế nút kéo (thumb) cho Webkit */
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
        /* Thiết kế nút kéo (thumb) cho Firefox */
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

        /* Các chỉ báo vòng tròn và đường ray */
        .indicators {
            position: absolute;
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: calc(100% - 8px); /* Chiều rộng bằng slider trừ đi chiều rộng của thumb */
            height: 2px;
            background-color: #888; /* Màu đường ray */
            left: 4px; /* Dịch sang phải một nửa chiều rộng của thumb để căn giữa */
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

            // Container mới để chứa thanh trượt và các chỉ báo
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

            // Các chỉ báo vòng tròn
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

            // Hàm cập nhật màu sắc chỉ báo
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
                console.log(`%c[LVD - INFO] Chế độ "Khiêu chiến nhanh": ${modeNames[speedUpMode]}.`,
                            'color: #8A2BE2;');
                updateIndicators();
            });

            // Gắn các phần tử vào container
            sliderControlContainer.appendChild(indicators);
            sliderControlContainer.appendChild(slider);

            sliderRow.appendChild(normalLabelWrapper);
            sliderRow.appendChild(sliderControlContainer);
            sliderRow.appendChild(fastLabelWrapper);

            container.appendChild(labelText);
            container.appendChild(sliderRow);

            targetElement.parentNode.insertBefore(container, targetElement.nextSibling);
            console.log('%c[LVD - INFO] Đã chèn Slider "Khiêu chiến nhanh".', 'color: lightgreen;');

            // Cập nhật màu sắc chỉ báo lần đầu
            updateIndicators();
        } else {
            console.warn('%c[LVD - CẢNH BÁO] Không tìm thấy ".auto-accept-label" để chèn slider.', 'color: orange;');
        }
    }, 10000);
}

    // ===============================================
    // HÀM XỬ LÝ CAN THIỆP THỜI GIAN
    // ===============================================

    // Ghi đè setTimeout để can thiệp
    window.setTimeout = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;

        // Chỉ can thiệp nếu chế độ không phải là Bình thường và delay phù hợp
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

    // Ghi đè setInterval để can thiệp
    window.setInterval = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;

        // Chỉ can thiệp nếu chế độ không phải là Bình thường và delay phù hợp
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
    // LOGIC CHÍNH CỦA TỰ ĐỘNG HÓA LUẬN VÕ
    // ===============================================

    /**
     * Hàm chính điều phối toàn bộ chu trình tự động hóa.
     */
    function startLuanVoDuongAutomation() {
        if (hasInitializedMainFlow) {
            return; // Đã khởi tạo, không chạy lại
        }
        hasInitializedMainFlow = true;

        console.log(`%c[HH3D LVD] Bắt đầu chu trình tự động hóa chính.`, 'background: #333; color: #f0f0f0;');

        // Bước 1: Luôn ưu tiên nhận thưởng trước
        tryReceiveReward();
    }

    /**
     * Cố gắng tìm và click nút "Nhận Thưởng".
     * Nếu tìm thấy và click thành công, thì đánh dấu `isRewardClaimedOrHandled = true` và dừng các chu trình khác.
     * Nếu không tìm thấy, chuyển sang bước `initiateJoinBattle()`.
     */
    function tryReceiveReward() {
        if (isRewardClaimedOrHandled) {
            console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý. Bỏ qua tìm nút Nhận Thưởng.`, 'color: #808080;');
            return;
        }
        console.log(`%c[LVD - AUTO] Đang tìm nút "Nhận Thưởng".`, 'color: #4CAF50;');
        const receiveRewardBtnSelector = 'button#receive-reward-btn.pushable.front';

        waitForElementStable(receiveRewardBtnSelector, (rewardButton) => {
            if (rewardButton) {
                console.log(`%c[LVD - AUTO] Đã tìm thấy nút "Nhận Thưởng". Đang click...`, 'color: limegreen;');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận Thưởng"')) {
                        console.log(`%c[LVD - AUTO] Đã click "Nhận Thưởng". Kết thúc chu trình tự động hóa.`, 'color: limegreen; font-weight: bold;');
                        isRewardClaimedOrHandled = true; // Đánh dấu đã nhận thưởng hoặc đã xử lý
                        // Không gọi hàm nào nữa, script sẽ dừng ở đây.
                        // Trang có thể tải lại sau khi nhận thưởng, và script sẽ bắt đầu lại.
                    } else {
                        console.warn(`%c[LVD - CẢNH BÁO] Click "Nhận Thưởng" thất bại. Thử lại sau %dms.`, 'color: orange;', DELAY_BETWEEN_RETRIES_SHORT);
                        setTimeout(tryReceiveReward, DELAY_BETWEEN_RETRIES_SHORT); // Thử lại
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                console.log(`%c[LVD - AUTO] Không tìm thấy nút "Nhận Thưởng". Chuyển sang Gia Nhập trận đấu.`, 'color: grey;');
                isRewardClaimedOrHandled = false; // Đảm bảo cờ này là false nếu không tìm thấy nút
                initiateJoinBattle(); // Chuyển sang bước tiếp theo
            }
        }, 5000); // Chờ nút nhận thưởng tối đa 5 giây, nếu không có thì coi như đã xử lý
    }


    /**
     * Cố gắng Gia Nhập trận đấu (ưu tiên gọi hàm trực tiếp, sau đó click ảnh).
     */
    function initiateJoinBattle() {
        if (isRewardClaimedOrHandled) {
            console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý. Bỏ qua Gia Nhập trận đấu.`, 'color: #808080;');

            return;
        }
        console.log(`%c[LVD - AUTO] Đang cố gắng gia nhập trận đấu.`, 'color: #FFD700;');
        try {
            if (typeof window.joinBattleFunction === 'function') {
                window.joinBattleFunction();
                console.log(`%c[LVD - AUTO] Đã gọi hàm joinBattleFunction().`, 'color: lightgreen;');
                setTimeout(confirmJoinBattle, DELAY_AFTER_FUNCTION_CALL);
            } else {
                console.log(`%c[LVD - AUTO] Không tìm thấy joinBattleFunction(). Fallback click ảnh.`, 'color: orange;');
                clickJoinBattleImageFallback();
            }
        } catch (error) {
            console.error(`%c[LVD - LỖI] Lỗi khi gọi joinBattleFunction(): %o. Fallback click ảnh.`, 'color: red;', error);
            clickJoinBattleImageFallback();
        }
    }

    /**
     * Phương án dự phòng: Click vào ảnh "Gia Nhập" nếu không gọi được hàm.
     */
    function clickJoinBattleImageFallback() {
        if (isRewardClaimedOrHandled) {
            console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý. Bỏ qua click ảnh Gia Nhập.`, 'color: #808080;');
            return;
        }
        console.log(`%c[LVD - AUTO] Đang tìm nút "Gia Nhập" (ảnh).`, 'color: #FFD700;');
        const joinBattleImgSelector = 'img#joinBattleImg.clickable-image[src="/wp-content/themes/halimmovies-child/assets/image/gif/vao-tham-chien.gif"]';

        waitForElementStable(joinBattleImgSelector, (joinButton) => {
            if (joinButton) {
                console.log(`%c[LVD - AUTO] Đã tìm thấy nút "Gia Nhập". Đang click...`, 'color: lightgreen;');
                setTimeout(() => {
                    if (safeClick(joinButton, 'nút "Gia Nhập"')) {
                        console.log(`%c[LVD - AUTO] Đã click "Gia Nhập".`, 'color: limegreen;');
                        confirmJoinBattle();
                    } else {
                        console.warn(`%c[LVD - AUTO] Click "Gia Nhập" thất bại. Thử lại sau.`, 'color: orange;');
                        setTimeout(initiateJoinBattle, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                        joinBattleRetryCount++; // Tăng biến đếm
                        if (joinBattleRetryCount < 2) { // Chỉ thử lại nếu số lần nhỏ hơn 2
                            console.log(`%c[LVD - AUTO] Không tìm thấy nút "Gia Nhập" (lần ${joinBattleRetryCount}). Thử lại sau.`, 'color: grey;');
                            setTimeout(initiateJoinBattle, DELAY_BETWEEN_RETRIES_LONG);
                        } else {
                                console.warn(`%c[LVD - CẢNH BÁO] Đã thử gia nhập 2 lần nhưng không thành công. Kết thúc chu trình.`, 'color: orange; font-weight: bold;');
                        }
            }
        });
    }

    /**
     * Xác nhận tham gia trận đấu.
     */
    function confirmJoinBattle() {
        if (isRewardClaimedOrHandled) {
            console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý. Bỏ qua xác nhận trận đấu.`, 'color: #808080;');
            return;
        }
        console.log(`%c[LVD - AUTO] Đang tìm nút xác nhận "Tham gia".`, 'color: #FF69B4;');
        const confirmButtonSelector = 'button.swal2-confirm.swal2-styled.swal2-default-outline';

        waitForElementStable(confirmButtonSelector, (confirmButton) => {
            if (confirmButton) {
                console.log(`%c[LVD - AUTO] Đã tìm thấy nút xác nhận "Tham gia". Đang click...`, 'color: lightgreen;');
                setTimeout(() => {
                    if (safeClick(confirmButton, 'nút "Tham gia" (xác nhận)')) {
                        console.log(`%c[LVD - AUTO] Đã click "Tham gia". Chờ trang tải lại.`, 'color: limegreen;');
                        // Sau khi xác nhận gia nhập, chuyển sang bật auto-accept (nếu chưa bật)
                        setTimeout(tryToggleAutoAccept, DELAY_AFTER_FUNCTION_CALL);
                    } else {
                        console.warn(`%c[LVD - AUTO] Click "Tham gia" thất bại. Thử lại sau.`, 'color: orange;');
                        setTimeout(confirmJoinBattle, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                console.warn(`%c[LVD - CẢNH BÁO] Không tìm thấy nút xác nhận "Tham gia". Chờ trang tải lại hoặc chuyển sang bật Auto Accept.`, 'color: grey;');
                // Nếu không tìm thấy nút xác nhận, có thể đã qua màn hình này, thử bật auto-accept
                setTimeout(tryToggleAutoAccept, DELAY_AFTER_FUNCTION_CALL);
            }
        });
    }

    /**
     * Cố gắng bật chế độ auto-accept.
     */
    function tryToggleAutoAccept() {
        if (isRewardClaimedOrHandled) { // Nếu đã nhận thưởng, không cần làm gì nữa
            console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý. Bỏ qua bật Auto Accept.`, 'color: #808080;');
            return;
        }

        console.log(`%c[LVD - AUTO] Đang tìm công tắc "auto_accept_toggle".`, 'color: #98FB98;');
        const autoAcceptToggleSelector = 'input[type="checkbox"]#auto_accept_toggle';

        waitForElementStable(autoAcceptToggleSelector, (toggleInput) => {
            if (isRewardClaimedOrHandled) { // Kiểm tra lại sau khi chờ
                console.log(`%c[LVD - INFO] Đã nhận thưởng/xử lý trong khi chờ Auto Accept.`, 'color: #808080;');
                return;
            }

            if (toggleInput) {
                if (!toggleInput.checked) {
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" CHƯA BẬT. Đang click...`, 'color: lightgreen;');
                    setTimeout(() => {
                        safeClick(toggleInput, 'công tắc "auto_accept_toggle"');
                        console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT.`, 'color: limegreen;');
                        // Sau khi bật auto accept, chu trình chính hoàn tất.
                    }, DELAY_BEFORE_CLICK);
                } else {
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT SẴN.`, 'color: limegreen;');
                    // Nếu đã bật, chu trình chính hoàn tất.
                }
            } else {
                console.log(`%c[LVD - AUTO] Không tìm thấy "auto_accept_toggle". Kết thúc chu trình tự động hóa chính.`, 'color: grey;');
            }
        }, 3000, INTERVAL_ELEMENT_STABLE);
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    // Log trạng thái khởi tạo
    console.log('%c[HH3D LVD] Kiểm tra trạng thái document để khởi động logic chính.', 'color: #DA70D6;');

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log(`%c[HH3D LVD] Document sẵn sàng (${document.readyState}). Khởi động tự động hóa.`, 'color: #DA70D6; font-weight: bold;');
        startLuanVoDuongAutomation();
    } else {
        console.log(`%c[HH3D LVD] Document chưa sẵn sàng (${document.readyState}). Chờ DOMContentLoaded.`, 'color: #DA70D6;');
        window.addEventListener('DOMContentLoaded', () => {
            console.log(`%c[HH3D LVD] DOMContentLoaded kích hoạt. Khởi động tự động hóa.`, 'color: #DA70D6; font-weight: bold;');
            startLuanVoDuongAutomation();
        });
    }

    // Khởi tạo UI cho Speed Up
    console.log('%c[HH3D LVD] Đang khởi tạo UI Speed Up.', 'color: #8A2BE2;');
    window.addEventListener('DOMContentLoaded', () => {
        createSpeedUpSliderUI();
    });
    // Fallback nếu DOMContentLoaded đã bắn trước khi script kịp gán listener
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createSpeedUpSliderUI();
    }

    // MutationObserver (giữ nguyên nhưng không log chi tiết)
    const observer = new MutationObserver((mutationsList, observer) => {
        // Có thể bỏ comment dòng dưới nếu cần debug lại các thay đổi DOM
        // console.log('[LVD - DEBUG] DOM Mutation detected.', mutationsList);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    console.log('%c[HH3D LVD] Thiết lập ban đầu hoàn tất.', 'color: #8A2BE2;');

})();
