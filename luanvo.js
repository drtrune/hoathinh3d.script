// ==UserScript==
// @name         HH3D Luận Võ Đường
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      2.0
// @description  Tự động gia nhập trận đấu, bật auto-accept và rút ngắn thời gian chờ trong Luận Võ Đường.
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/luan-vo-duong*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Log khởi đầu script - RẤT QUAN TRỌNG để biết script đã chạy
    console.log('%c[HH3D LVD] Script đã tải.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // CẤU HÌNH BIẾN TOÀN CỤC & THỜI GIAN
    // ===============================================

    // Cấu hình cho tính năng Auto Join/Accept
    const TIMEOUT_ELEMENT_STABLE = 5000; // 5 giây: Thời gian tối đa chờ một phần tử xuất hiện ổn định
    const INTERVAL_ELEMENT_STABLE = 500;  // 0.5 giây: Khoảng thời gian giữa các lần kiểm tra phần tử
    const DELAY_BEFORE_CLICK = 750;       // 0.75 giây: Độ trễ trước khi thực hiện click
    const DELAY_AFTER_FUNCTION_CALL = 1500; // 1.5 giây: Độ trễ sau khi gọi hàm để UI kịp cập nhật
    const DELAY_BETWEEN_RETRIES_SHORT = 1000; // 1 giây: Độ trễ ngắn khi thử lại hành động
    const DELAY_BETWEEN_RETRIES_LONG = 3000; // 3 giây: Độ trễ dài hơn khi không tìm thấy phần tử/hàm chính

    // Cấu hình cho tính năng Speed Up
    const SHORTENED_DELAY_SETTIMEOUT = 100; // 100ms (0.1 giây) cho setTimeout
    const SHORTENED_INTERVAL_DELAY = 10;    // 10ms (0.01 giây) cho setInterval

    // Trạng thái chung của tính năng speed up (mặc định BẬT)
    let speedUpActive = true;
    // Biến để theo dõi trạng thái khởi tạo chính của luồng Auto Join/Accept
    let hasInitializedMainFlow = false;

    // Lưu trữ các hàm setTimeout/setInterval gốc
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let intervalId;

        // Chỉ log khi bắt đầu chờ
        console.log(`%c[LVD - DEBUG] Chờ "%s"`, 'color: #00FFFF;', selector);

        intervalId = setInterval(() => {
            const foundElement = document.querySelector(selector);
            const elapsedTime = Date.now() - startTime;

            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                // Log khi tìm thấy và ổn định
                console.log(`%c[LVD - DEBUG] "%s" ĐÃ SẴN SÀNG.`, 'color: limegreen;', selector);
                clearInterval(intervalId);
                callback(foundElement);
            } else if (elapsedTime >= timeout) {
                // Cảnh báo khi hết thời gian
                console.warn(`%c[LVD - DEBUG] HẾT THỜI GIAN chờ "%s".`, 'color: orange;', selector);
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
            // Chỉ log khi click thành công
            console.log(`%c[LVD - INFO] Đã click "%s".`, 'color: lightblue;', elementName);
            return true;
        } catch (e) {
            console.error(`%c[LVD - LỖI] KHÔNG THỂ CLICK "%s": %o`, 'color: red;', elementName, e);
            return false;
        }
    }

    // ===============================================
    // HÀM TIỆN ÍCH UI (CHO NÚT GẠT SPEED UP)
    // ===============================================

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function createToggleSwitchUI() {
        addStyle(`
            /* Container cho nút gạt và nhãn */
            .speed-up-toggle-container {
                margin-top: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                color: #bbb;
                font-size: 14px;
                user-select: none;
                width: 100%;
            }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #ccc; -webkit-transition: .4s; transition: .4s; border-radius: 24px;
            }
            .slider:before {
                position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px;
                background-color: white; -webkit-transition: .4s; transition: .4s; border-radius: 50%;
            }
            input:checked + .slider { background-color: #4CAF50; }
            input:focus + .slider { box-shadow: 0 0 1px #4CAF50; }
            input:checked + .slider:before {
                -webkit-transform: translateX(20px); -ms-transform: translateX(20px); transform: translateX(20px);
            }
            .slider.round { border-radius: 24px; }
            .slider.round:before { border-radius: 50%; }
        `);

        const targetElementSelector = '.auto-accept-label';
        waitForElementStable(targetElementSelector, (targetElement) => {
            if (targetElement) {
                const container = document.createElement('div');
                container.className = 'speed-up-toggle-container';

                const labelText = document.createElement('label');
                labelText.textContent = 'Khiêu chiến nhanh';
                labelText.htmlFor = 'speedUpToggleSwitch';

                const switchWrapper = document.createElement('label');
                switchWrapper.className = 'switch';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'speedUpToggleSwitch';
                checkbox.checked = speedUpActive;
                checkbox.addEventListener('change', (e) => {
                    speedUpActive = e.target.checked;
                    console.log(`%c[LVD - INFO] Chế độ "Khiêu chiến nhanh": ${speedUpActive ? 'Đã BẬT' : 'Đã TẮT'}.`,
                                'color: #8A2BE2;');
                });

                const slider = document.createElement('span');
                slider.className = 'slider round';

                switchWrapper.appendChild(checkbox);
                switchWrapper.appendChild(slider);

                container.appendChild(labelText);
                container.appendChild(switchWrapper);

                targetElement.parentNode.insertBefore(container, targetElement.nextSibling);
                console.log('%c[LVD - INFO] Đã chèn nút gạt "Khiêu chiến nhanh".', 'color: lightgreen;');
            } else {
                console.warn('%c[LVD - CẢNH BÁO] Không tìm thấy ".auto-accept-label" để chèn nút gạt.', 'color: orange;');
            }
        }, 10000); // Chờ 10 giây cho element .auto-accept-label
    }

    // ===============================================
    // HÀM XỬ LÝ CAN THIỆP THỜI GIAN
    // ===============================================

    window.setTimeout = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;

        if (speedUpActive && delay === 3000 && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('o("timer")') && callbackString.includes('delete e.timeout')) {
                const stack = new Error().stack;
                if (stack && stack.includes('sweetalert2.min.js')) {
                    actualDelay = SHORTENED_DELAY_SETTIMEOUT;
                    intervened = true;
                }
            }
        }

        if (intervened) {
            console.log(`%c[LVD - SPEED UP] Rút ngắn delay từ ${delay}ms xuống ${actualDelay}ms.`, 'color: #FFA500;');
        }
        return originalSetTimeout(callback, actualDelay, ...args);
    };

    window.setInterval = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;

        if (speedUpActive && delay === 1000 && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('--y>0?') && callbackString.includes('clearInterval(window.countdownInterval)') && callbackString.includes('t()')) {
                 const stack = new Error().stack;
                 if (stack && stack.includes('luan-vo.min.js')) {
                    actualDelay = SHORTENED_INTERVAL_DELAY;
                    intervened = true;
                 }
            }
        }

        if (intervened) {
            console.log(`%c[LVD - SPEED UP] Tăng tốc interval từ ${delay}ms xuống ${actualDelay}ms.`, 'color: #FFA500;');
        }
        return originalSetInterval(callback, actualDelay, ...args);
    };

    // ===============================================
    // LOGIC CHÍNH CỦA TỰ ĐỘNG HÓA LUẬN VÕ
    // ===============================================

    function startLuanVoDuongAutomation() {
        if (hasInitializedMainFlow) {
            // Không log khi hàm này được gọi lại (do DOMContentLoaded và readystate)
            return;
        }
        hasInitializedMainFlow = true;

        console.log(`%c[HH3D LVD] Bắt đầu tự động hóa.`, 'background: #333; color: #f0f0f0;');
        
        tryToggleAutoAccept();
    }

    function tryToggleAutoAccept() {
        console.log(`%c[LVD - AUTO] Đang tìm công tắc "auto_accept_toggle".`, 'color: #98FB98;');
        const autoAcceptToggleSelector = 'input[type="checkbox"]#auto_accept_toggle';

        waitForElementStable(autoAcceptToggleSelector, (toggleInput) => {
            if (toggleInput) {
                if (!toggleInput.checked) {
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" CHƯA BẬT. Đang click...`, 'color: lightgreen;');
                    setTimeout(() => {
                        safeClick(toggleInput, 'công tắc "auto_accept_toggle"');
                        console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT.`, 'color: limegreen;');
                    }, DELAY_BEFORE_CLICK);
                } else {
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT SẴN.`, 'color: limegreen;');
                }
            } else {
                console.log(`%c[LVD - AUTO] Không tìm thấy "auto_accept_toggle". Chuyển sang Gia Nhập.`, 'color: grey;');
                initiateJoinBattle();
            }
        }, 3000, INTERVAL_ELEMENT_STABLE);
    }

    function initiateJoinBattle() {
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

    function clickJoinBattleImageFallback() {
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
                console.log(`%c[LVD - AUTO] Không tìm thấy nút "Gia Nhập". Thử lại sau.`, 'color: grey;');
                setTimeout(initiateJoinBattle, DELAY_BETWEEN_RETRIES_LONG);
            }
        });
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
                    } else {
                        console.warn(`%c[LVD - AUTO] Click "Tham gia" thất bại. Thử lại sau.`, 'color: orange;');
                        setTimeout(confirmJoinBattle, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                console.warn(`%c[LVD - CẢNH BÁO] Không tìm thấy nút xác nhận "Tham gia". Chờ trang tải lại.`, 'color: grey;');
            }
        });
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
        createToggleSwitchUI();
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createToggleSwitchUI();
    }

    // MutationObserver (giữ nguyên nhưng không log chi tiết)
    const observer = new MutationObserver((mutationsList, observer) => {
        // Có thể bỏ comment dòng dưới nếu cần debug lại các thay đổi DOM
        // console.log('[LVD - DEBUG] DOM Mutation detected.', mutationsList);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    console.log('%c[HH3D LVD] Thiết lập ban đầu hoàn tất.', 'color: #8A2BE2;');

})();
