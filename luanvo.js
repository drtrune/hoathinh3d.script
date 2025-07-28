// ==UserScript==
// @name         HH3D Luận Võ Đường
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      2.1
// @description  Tự động gia nhập trận đấu, bật auto-accept, nhận thưởng và rút ngắn thời gian chờ trong Luận Võ Đường
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/luan-vo-duong*
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
    const DELAY_AFTER_FUNCTION_CALL = 1500; // 1.5 giây: Độ trễ sau khi gọi hàm để UI kịp cập nhật
    const DELAY_BETWEEN_RETRIES_SHORT = 1000; // 1 giây: Độ trễ ngắn khi thử lại hành động
    const DELAY_BETWEEN_RETRIES_LONG = 3000; // 3 giây: Độ trễ dài hơn khi không tìm thấy phần tử/hàm chính

    // Cấu hình cho tính năng Speed Up
    const SHORTENED_DELAY_SETTIMEOUT = 200; // 200ms cho setTimeout
    const SHORTENED_INTERVAL_DELAY = 200;    // 200ms cho setInterval

    // Trạng thái chung của tính năng speed up (mặc định BẬT)
    let speedUpActive = true;
    // Biến để theo dõi trạng thái khởi tạo chính của luồng Auto Join/Accept
    let hasInitializedMainFlow = false;
    // Biến mới: Theo dõi trạng thái đã nhận thưởng hoặc không có nút nhận thưởng
    let isRewardClaimedOrHandled = false;

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

    // Ghi đè setTimeout để can thiệp
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

    // Ghi đè setInterval để can thiệp
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

    /**
     * Hàm chính điều phối toàn bộ chu trình tự động hóa.
     */
    function startLuanVoDuongAutomation() {
        if (hasInitializedMainFlow) {
            return; // Đã khởi tạo, không chạy lại
        }
        hasInitializedMainFlow = true;

        console.log(`%c[HH3D LVD] Bắt đầu chu trình tự động hóa chính.`, 'background: #333; color: #f0f0f0;');

        // Bước 1: Luôn ưu tiên bật auto-accept
        tryToggleAutoAccept();
    }

    /**
     * Cố gắng bật chế độ auto-accept. Nếu không tìm thấy, chuyển sang bước Nhận Thưởng.
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
                        // Sau khi bật auto accept, chuyển sang kiểm tra nhận thưởng
                        setTimeout(tryReceiveReward, DELAY_AFTER_FUNCTION_CALL);
                    }, DELAY_BEFORE_CLICK);
                } else {
                    console.log(`%c[LVD - AUTO] "auto_accept_toggle" ĐÃ BẬT SẴN.`, 'color: limegreen;');
                    // Nếu đã bật, chuyển sang kiểm tra nhận thưởng
                    tryReceiveReward();
                }
            } else {
                console.log(`%c[LVD - AUTO] Không tìm thấy "auto_accept_toggle". Chuyển sang kiểm tra Nhận Thưởng.`, 'color: grey;');
                // Nếu không tìm thấy công tắc, có thể đã ở màn hình khác, thử nhận thưởng hoặc gia nhập
                tryReceiveReward();
            }
        }, 3000, INTERVAL_ELEMENT_STABLE);
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
                console.log(`%c[LVD - AUTO] Không tìm thấy nút "Gia Nhập". Thử lại sau.`, 'color: grey;');
                setTimeout(initiateJoinBattle, DELAY_BETWEEN_RETRIES_LONG);
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
    // Chờ DOMContentLoaded hoặc document sẵn sàng để đảm bảo các phần tử cần thiết cho UI có thể tìm thấy.
    console.log('%c[HH3D LVD] Đang khởi tạo UI Speed Up.', 'color: #8A2BE2;');
    window.addEventListener('DOMContentLoaded', () => {
        createToggleSwitchUI();
    });
    // Fallback nếu DOMContentLoaded đã bắn trước khi script kịp gán listener
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
