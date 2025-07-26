// ==UserScript==
// @name         HH3D Hoang vực
// @namespace    http://tampermonkey.net/
// @version      3.9
// @description  Nhận thưởng. Tự động tối ưu ngũ hành và chiến đấu theo chu kỳ.
// @author       Bạn
// @match        https://hoathinh3d.gg/hoang-vuc*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Tự động Tối ưu & Chiến đấu] Script đã được tải.');

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const LOCAL_STORAGE_KEY = 'hoathinh3d_element_priority';
    let currentPriority = localStorage.getItem(LOCAL_STORAGE_KEY) || 'no-decrease';
    let isUIMade = false;
    let isScriptFullyInitialized = false; // Cờ mới để đảm bảo initializeScript chỉ chạy 1 lần
    let uiObserver = null; // Biến để lưu trữ MutationObserver cho UI

    // Biến để lưu trữ ID của các setTimeout/setInterval để có thể dừng nếu script cần dừng hoàn toàn
    let currentTimerId = null;

    // Hàm tiện ích để chờ một phần tử xuất hiện trong DOM bằng cách lặp thăm dò ổn định
    function waitForElementStable(selector, callback, timeout = 15000, interval = 500) {
        let startTime = Date.now();
        let foundElement = null;
        let checkCount = 0;

        const intervalId = setInterval(() => {
            foundElement = document.querySelector(selector);
            checkCount++;

            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                console.log(`[Tự động Tối ưu & Chiến đấu] waitForElementStable: Đã tìm thấy "${selector}" và hiển thị/không disabled trong ${Date.now() - startTime}ms (sau ${checkCount} lần kiểm tra).`);
                clearInterval(intervalId);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                console.warn(`[Tự động Tối ưu & Chiến đấu] waitForElementStable: HẾT THỜI GIAN chờ "${selector}" sau ${timeout/1000}s. Phần tử không tìm thấy, không hiển thị hoặc bị disabled.`);
                clearInterval(intervalId);
                callback(null);
            }
        }, interval);
    }

    // Hàm an toàn để click một phần tử
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            console.error(`[Tự động Tối ưu & Chiến đấu] LỖI: Không thể click vì ${elementName} là null.`);
            return false;
        }
        if (element.disabled) {
            console.warn(`[Tự động Tối ưu & Chiến đấu] CẢNH BÁO: ${elementName} bị disabled, không thể click.`);
            return false;
        }

        try {
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            console.log(`[Tự động Tối ưu & Chiến đấu] Đã dispatch MouseEvent 'click' cho ${elementName}.`);
            return true;
        } catch (e) {
            console.warn(`[Tự động Tối ưu & Chiến đấu] LỖI khi dispatch MouseEvent cho ${elementName}:`, e, "Thử cách click trực tiếp.");
            try {
                element.click();
                console.log(`[Tự động Tối ưu & Chiến đấu] Đã click trực tiếp ${elementName}.`);
                return true;
            } catch (e2) {
                console.error(`[Tự động Tối ưu & Chiến đấu] LỖI KHÔNG THỂ CLICK ${elementName} (cả 2 cách):`, e2);
                return false;
            }
        }
    }

    // Hàm kiểm tra trạng thái sát thương hiện tại
    function getDamageStatus() {
        const damageInfoElement = document.querySelector('div.damage-info');
        if (damageInfoElement && damageInfoElement.offsetParent !== null) {
            const text = damageInfoElement.textContent.trim();
            if (text.includes('giảm') || text.includes('decrease')) {
                console.log(`[Tự động Tối ưu & Chiến đấu] Phát hiện trạng thái sát thương: GIẢM ("${text}")`);
                return 'decrease';
            }
            if (text.includes('tăng') || text.includes('increase')) {
                 console.log(`[Tự động Tối ưu & Chiến đấu] Phát hiện trạng thái sát thương: TĂNG ("${text}")`);
                 return 'increase';
            }
        }
        console.log('[Tự động Tối ưu & Chiến đấu] Phát hiện trạng thái sát thương: KHÔNG (không có giảm/tăng rõ ràng).');
        return 'none';
    }

    // NEW FUNCTION: Clicks the reward close button and then waits for the modal to truly disappear
    function clickRewardCloseButtonAndThenWaitForModalToClose(callback) {
        // First, explicitly look for the "reward-close" button
        waitForElementStable('button.reward-close', (closeButton) => {
            if (closeButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] Đã tìm thấy nút "reward-close". Đang click để đóng hộp thoại.');
                setTimeout(() => {
                    if (safeClick(closeButton, 'nút "reward-close"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "reward-close" THÀNH CÔNG! Đang chờ hộp thoại biến mất.');
                        // After clicking the close button, then wait for the whole notification to be gone
                        waitForModalToClose(callback, 'hộp thoại "Thành công!"');
                    } else {
                        console.warn('[Tự động Tối ưu & Chiến đấu] KHÔNG THỂ click nút "reward-close". Vẫn thử chờ hộp thoại biến mất.');
                        waitForModalToClose(callback, 'hộp thoại "Thành công!" (dự phòng)');
                    }
                }, 500); // Small delay before clicking
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Không tìm thấy nút "reward-close". Có thể hộp thoại tự đóng hoặc đã có lỗi. Đang chờ hộp thoại biến mất.');
                waitForModalToClose(callback, 'hộp thoại "Thành công!" (không nút đóng)');
            }
        }, 5000); // Wait up to 5 seconds for the close button
    }


    // Hàm mới: Chờ cho hộp thoại (modal) đóng
    // Nó sẽ kiểm tra sự biến mất của phần tử lớp phủ hoặc hộp thoại
    function waitForModalToClose(callback, modalName = 'hộp thoại') {
        // Use a more specific selector for the reward notification itself, plus generic ones as fallback
        const modalSelector = 'div.reward-notification.success, div.swal2-container.swal2-center.swal2-backdrop-show, .modal-backdrop, .modal.show';
        let checkAttempts = 0;
        const maxAttempts = 20; // Kiểm tra tối đa 20 lần (20 * 300ms = 6 giây)
        const checkInterval = 300; // Kiểm tra mỗi 300ms

        console.log(`[Tự động Tối ưu & Chiến đấu] Đang chờ ${modalName} đóng...`);

        const intervalId = setInterval(() => {
            const modalElement = document.querySelector(modalSelector);
            checkAttempts++;

            // If the modal element is no longer in the DOM, or it's not displayed
            if (!modalElement || modalElement.offsetParent === null || modalElement.style.display === 'none') {
                console.log(`[Tự động Tối ưu & Chiến đấu] ${modalName} đã đóng hoặc không còn hiển thị sau ${checkAttempts * checkInterval}ms.`);
                clearInterval(intervalId);
                callback();
            } else if (checkAttempts >= maxAttempts) {
                console.warn(`[Tự động Tối ưu & Chiến đấu] HẾT THỜI GIAN chờ ${modalName} đóng. Có thể hộp thoại vẫn còn mở hoặc bị ẩn. Vẫn tiếp tục.`);
                clearInterval(intervalId);
                callback();
            }
        }, checkInterval);
    }


    function changeElementAndConfirm() {
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình thay đổi ngũ hành.');
        waitForElementStable('button#change-element-button.change-element-button', (changeButton) => {
            if (changeButton) {
                setTimeout(() => {
                    if (safeClick(changeButton, 'nút "Thay đổi"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] Đã nhấp nút "Thay đổi".');
                        waitForElementStable('button.swal2-confirm.swal2-styled', (confirmButton) => {
                            if (confirmButton) {
                                setTimeout(() => {
                                    if (safeClick(confirmButton, 'nút "Đổi" (xác nhận)')) {
                                        console.log('[Tự động Tối ưu & Chiến đấu] Đã nhấp nút "Đổi" (xác nhận).');
                                        setTimeout(() => {
                                            console.log('[Tự động Tối ưu & Chiến đấu] Đang chờ trạng thái sát thương cập nhật sau khi thay đổi ngũ hành (trễ 2s)...');
                                            checkRemainingAttacksThenContinue(); // Quay lại kiểm tra lượt đánh
                                        }, 2000);
                                    } else {
                                        console.log('[Tự động Tối ưu & Chiến đấu] Không thể click nút "Đổi" (xác nhận). Đang thử lại thay đổi ngũ hành nếu cần.');
                                        setTimeout(checkRemainingAttacksThenContinue, 1500);
                                    }
                                }, 700);
                            } else {
                                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Đổi" (xác nhận) không thể tìm thấy hoặc hiển thị. Đang thử lại thay đổi ngũ hành nếu cần.');
                                setTimeout(checkRemainingAttacksThenContinue, 1500);
                            }
                        }, 7000);
                    } else {
                        console.log('[Tự động Tối ưu & Chiến đấu] Không thể click nút "Thay đổi". Đang thử lại toàn bộ quá trình.');
                        setTimeout(checkRemainingAttacksThenContinue, 1500);
                    }
                }, 1000);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Thay đổi" không thể tìm thấy hoặc hiển thị. Đang thử lại toàn bộ quá trình.');
                setTimeout(checkRemainingAttacksThenContinue, 1500);
            }
        }, 7000);
    }

    function startBattleNow() {
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình chiến đấu: Nhấp "Khiêu chiến".');
        const battleButtonSelector = 'button.battle-button#battle-button';

        waitForElementStable(battleButtonSelector, (battleButton) => {
            if (battleButton) {
                setTimeout(() => {
                    if (safeClick(battleButton, 'nút "Khiêu chiến"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Khiêu chiến" THÀNH CÔNG! Bây giờ đang chờ nút "Tấn Công"...');
                        clickAttackButton();
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] KHÔNG THỂ NHẤP nút "Khiêu chiến". Thử lại...');
                        setTimeout(checkRemainingAttacksThenContinue, 2000);
                    }
                }, 1000);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Khiêu chiến" không thể tìm thấy hoặc hiển thị. Sẽ kiểm tra lại sớm.');
                setTimeout(checkRemainingAttacksThenContinue, 2000);
            }
        }, 10000);
    }

    function clickAttackButton() {
        console.log('[Tự động Tối ưu & Chiến đấu] Đang cố gắng nhấp nút "Tấn Công".');
        const attackButtonSelector = 'button.attack-button';

        waitForElementStable(attackButtonSelector, (attackButton) => {
            if (attackButton) {
                setTimeout(() => {
                    if (safeClick(attackButton, 'nút "Tấn Công"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Tấn Công" THÀNH CÔNG! Trận chiến bây giờ sẽ bắt đầu.');
                        setTimeout(() => {
                            checkPostBattleState();
                        }, 2000);
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] KHÔNG THỂ NHẤP nút "Tấn Công". Thử lại...');
                        setTimeout(clickAttackButton, 1000);
                    }
                }, 1500);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Tấn Công" không thể tìm thấy hoặc hiển thị. Đang thử lại kiểm tra.');
                setTimeout(clickAttackButton, 1000);
            }
        }, 15000);
    }

    function checkPostBattleState() {
        console.log('[Tự động Tối ưu & Chiến đấu] Đang kiểm tra trạng thái sau trận đấu: tìm nút "Nhận thưởng" hoặc "Trở lại".');

        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] Đã tìm thấy nút "Nhận thưởng". Đang click để nhận thưởng.');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Nhận thưởng" THÀNH CÔNG! Đang chờ hộp thoại đóng...');
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại nhận thưởng đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                            checkRemainingAttacksThenContinue(); // Quay lại kiểm tra lượt đánh SAU KHI NHẬN THƯỞNG
                        });
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] LỖI khi nhấp nút "Nhận thưởng" sau trận đấu. Vẫn quay lại kiểm tra trạng thái lượt đánh.');
                        setTimeout(checkRemainingAttacksThenContinue, 1000);
                    }
                }, 500);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Không tìm thấy nút "Nhận thưởng". Đang tìm nút "Trở lại".');
                clickBackButton();
            }
        }, 7000);
    }

    function clickBackButton() {
        console.log('[Tự động Tối ưu & Chiến đấu] Đang cố gắng nhấp nút "Trở lại" để đóng hộp thoại.');
        const backButtonSelector = 'button.back-button';

        waitForElementStable(backButtonSelector, (backButton) => {
            if (backButton) {
                setTimeout(() => {
                    if (safeClick(backButton, 'nút "Trở lại"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Trở lại" THÀNH CÔNG! Hộp thoại đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                        waitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại trở lại đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                            checkRemainingAttacksThenContinue(); // Quay lại kiểm tra lượt đánh SAU KHI CLICK TRỞ LẠI
                        }, 'hộp thoại trở lại');
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] LỖI khi nhấp nút "Trở lại". Vẫn quay lại kiểm tra trạng thái lượt đánh.');
                        setTimeout(checkRemainingAttacksThenContinue, 1000);
                    }
                }, 500);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Trở lại" không thể tìm thấy hoặc hiển thị. Có thể trang đã tự chuyển. Quay lại kiểm tra trạng thái lượt đánh.');
                setTimeout(checkRemainingAttacksThenContinue, 1000);
            }
        }, 5000);
    }

    function getCooldownTimeFromElement(cooldownTimerElement) {
        if (cooldownTimerElement && cooldownTimerElement.offsetParent !== null) {
            const text = cooldownTimerElement.textContent.trim();
            console.log(`[Tự động Tối ưu & Chiến đấu] Đọc văn bản hẹn giờ hồi chiêu: "${text}"`);

            const match = text.match(/Chờ (\d+) phút (\d+) giây/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const totalMilliseconds = (minutes * 60 + seconds) * 1000;
                console.log(`[Tự động Tối ưu & Chiến đấu] Thời gian hồi chiêu đã phân tích: ${minutes} phút ${seconds} giây (${totalMilliseconds}ms).`);
                return totalMilliseconds;
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Không thể phân tích văn bản hẹn giờ hồi chiêu. Coi như không có hồi chiêu.');
            }
        }
        console.log('[Tự động Tối ưu & Chiến đấu] Phần tử hẹn giờ hồi chiêu không hiển thị hoặc không có văn bản.');
        return 0;
    }

    // Hàm kiểm tra lượt đánh và sau đó tiếp tục chu trình (cooldown hoặc battle)
    function checkRemainingAttacksThenContinue() {
        console.log('[Tự động Tối ưu & Chiến đấu] Kiểm tra lượt đánh còn lại trước khi tiếp tục chu kỳ.');
        const remainingAttacksElement = document.querySelector('div.remaining-attacks');
        if (remainingAttacksElement) {
            const attacksText = remainingAttacksElement.textContent;
            const match = attacksText.match(/Lượt đánh còn lại:\s*(\d+)/);
            if (match) {
                const remainingAttacks = parseInt(match[1]);
                console.log(`[Tự động Tối ưu & Chiến đấu] Lượt đánh còn lại: ${remainingAttacks}`);

                if (remainingAttacks <= 0) {
                    console.log('[Tự động Tối ưu & Chiến đấu] HẾT LƯỢT ĐÁNH. Dừng script.');
                    return; // Dừng script hoàn toàn
                }
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Không thể đọc số lượt đánh còn lại sau trận đấu. Vẫn tiếp tục chu kỳ.');
            }
        } else {
            console.warn('[Tự động Tối ưu & Chiến đấu] Không tìm thấy phần tử hiển thị lượt đánh còn lại sau trận đấu. Vẫn tiếp tục chu kỳ.');
        }

        // Nếu còn lượt đánh hoặc không đọc được lượt đánh, tiếp tục với logic cooldown/battle
        startBattleCycle();
    }


    // Hàm chính của vòng lặp chiến đấu
    function startBattleCycle() {
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu vòng lặp chiến đấu: Kiểm tra cooldown.');

        waitForElementStable('#countdown-timer', (cooldownTimerElement) => {
            const cooldownMs = getCooldownTimeFromElement(cooldownTimerElement);
            if (cooldownMs > 0) {
                const waitTime = cooldownMs + 5000; // Thêm 5 giây dự phòng
                console.log(`[Tự động Tối ưu & Chiến đấu] Phát hiện hồi chiêu. Đang chờ ${waitTime / 1000} giây trước khi thử lại.`);
                // Xóa timer cũ nếu có để tránh conflict
                if (currentTimerId) clearTimeout(currentTimerId);
                currentTimerId = setTimeout(() => {
                    console.log('[Tự động Tối ưu & Chiến đấu] Hồi chiêu đã kết thúc. Đang kiểm tra lại trạng thái lượt đánh.');
                    checkRemainingAttacksThenContinue(); // Gọi lại để bắt đầu chu kỳ mới sau cooldown
                }, waitTime);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Không có hồi chiêu đang hoạt động. Tiến hành logic ngũ hành và chiến đấu.');
                processElementAndBattle();
            }
        }, 7000); // Tăng timeout cho cooldown timer nếu cần
    }

    function processElementAndBattle() {
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình chính: Kiểm tra Ngũ hành -> Thay đổi nếu cần -> Khiêu chiến -> Tấn Công.');
        const currentDamageStatus = getDamageStatus();
        if (currentPriority === 'no-decrease') {
            console.log(`[Tự động Tối ưu & Chiến đấu] Ưu tiên hiện tại: "Không bị giảm sát thương". Trạng thái sát thương: "${currentDamageStatus}".`);
            if (currentDamageStatus === 'decrease') {
                console.warn('[Tự động Tối ưu & Chiến đấu] Sát thương đang BỊ GIẢM! Bắt đầu thay đổi ngũ hành để tránh bị giảm.');
                changeElementAndConfirm();
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Sát thương KHÔNG bị giảm. Tiếp tục bắt đầu chiến đấu.');
                startBattleNow();
            }
        } else if (currentPriority === 'seek-increase') {
            console.log(`[Tự động Tối ưu & Chiến đấu] Ưu tiên hiện tại: "Tìm tăng sát thương". Trạng thái sát thương: "${currentDamageStatus}".`);
            if (currentDamageStatus === 'increase') {
                console.log('[Tự động Tối ưu & Chiến đấu] Sát thương đang ĐƯỢC TĂNG! Tiếp tục bắt đầu chiến đấu.');
                startBattleNow();
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Sát thương KHÔNG được tăng (trạng thái: ' + currentDamageStatus + '). Bắt đầu thay đổi ngũ hành để cố gắng tăng.');
                changeElementAndConfirm();
            }
        }
    }

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function createUI() {
        if (isUIMade) {
            console.log('[Tự động Tối ưu & Chiến đấu] UI đã được tạo, bỏ qua việc tạo.');
            return;
        }

        addStyle(`
            #autoBattleConfig {
                background: rgba(40, 44, 52, 0.9);
                color: white;
                padding: 5px 10px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                z-index: 9999;
                border: 1px solid #555;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                margin-bottom: 5px;
                width: fit-content;
                max-width: 200px;
                margin-left: auto;
                margin-right: auto;
            }
            #autoBattleConfig label {
                margin-right: 0px;
                font-weight: bold;
                color: #ADD8E6;
                white-space: nowrap;
            }
            #autoBattleConfig select {
                background: #333;
                color: white;
                border: 1px solid #666;
                border-radius: 4px;
                padding: 3px 5px;
                cursor: pointer;
                width: auto;
                min-width: 150px;
            }
            #autoBattleConfig select:focus {
                outline: none;
                border-color: #7BC0E3;
                box-shadow: 0 0 0 2px rgba(123, 192, 227, 0.3);
            }
        `);

        // Use waitForElementStable for UI creation as well
        waitForElementStable('button#change-element-button.change-element-button', (targetButton) => {
            if (targetButton && !isUIMade) {
                const configDiv = document.createElement('div');
                configDiv.id = 'autoBattleConfig';
                configDiv.innerHTML = `
                    <label for="elementPriority">Ưu tiên:</label>
                    <select id="elementPriority">
                        <option value="no-decrease">Không bị giảm sát thương</option>
                        <option value="seek-increase">Tìm tăng sát thương</option>
                    </select>
                `;
                targetButton.parentNode.insertBefore(configDiv, targetButton);

                const selectElement = configDiv.querySelector('#elementPriority');
                selectElement.value = currentPriority;

                selectElement.addEventListener('change', (event) => {
                    currentPriority = event.target.value;
                    localStorage.setItem(LOCAL_STORAGE_KEY, currentPriority);
                    console.log(`[Tự động Tối ưu & Chiến đấu] Ưu tiên ngũ hành đã thay đổi thành: ${currentPriority} và đã lưu.`);
                });

                isUIMade = true;
                console.log('[Tự động Tối ưu & Chiến đấu] UI đã được tạo và căn giữa phía trên nút "Thay đổi".');
            } else if (isUIMade) {
                console.log('[Tự động Tối ưu & Chiến đấu] UI đã được tạo, bỏ qua.');
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Không tìm thấy nút mục tiêu cho UI hoặc UI đã tồn tại. UI sẽ không được tạo.');
            }
        }, 10000);
    }

    // --- Hàm khởi tạo chính của script ---
    function initializeScript() {
        // Chỉ chạy một lần duy nhất
        if (isScriptFullyInitialized) {
            console.log('[Tự động Tối ưu & Chiến đấu] initializeScript đã được gọi. Bỏ qua lần này.');
            return;
        }
        isScriptFullyInitialized = true; // Đặt cờ ngay lập tức

        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình khởi tạo script (lần đầu).');

        // Tạo UI trước khi kiểm tra các điều kiện dừng script
        createUI();

        // 1. Ưu tiên kiểm tra nút "Nhận thưởng"
        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Phát hiện nút "Nhận thưởng". Đang click...');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng" khởi động')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Nhận thưởng" THÀNH CÔNG! Đang chờ hộp thoại đóng để dừng script...');
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại nhận thưởng đã đóng. Boss đã chết và thưởng đã được nhận. Script sẽ DỪNG tại đây.');
                            // Script sẽ dừng tự nhiên ở đây, không cần gọi thêm logic chiến đấu.
                        });
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] LỖI khi nhấp nút "Nhận thưởng" khi khởi động. Script sẽ DỪNG.');
                    }
                }, 500);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Không tìm thấy nút "Nhận thưởng". Kiểm tra trạng thái "Boss chưa mở Phong Ấn".');
                // 2. Nếu không có nút nhận thưởng, kiểm tra trạng thái "Boss chưa mở Phong Ấn"
                const bossSealedElement = document.querySelector('div.highlight-text-box');
                if (bossSealedElement && bossSealedElement.textContent.includes('Boss chưa mở Phong Ấn')) {
                    console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Phát hiện "Boss chưa mở Phong Ấn". Boss đã chết và thưởng đã nhận. Script sẽ DỪNG tại đây.');
                } else {
                    console.log('[Tự động Tối ưu & Chiến đấu] KHỞI Động: Boss có thể khiêu chiến được. Bắt đầu kiểm tra lượt đánh và logic chiến đấu.');
                    checkRemainingAttacksThenContinue(); // Bắt đầu vòng lặp chiến đấu chính bằng cách kiểm tra lượt đánh
                }
            }
        }, 7000); // Tăng timeout cho rewardButton khi khởi động để đảm bảo nó có thời gian tải đầy đủ
    }

    // --- Điểm bắt đầu chính của script ---
    // Sử dụng DOMContentLoaded để đảm bảo DOM đã sẵn sàng trước khi chạy logic chính
    // và chỉ chạy một lần.
    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Tự động Tối ưu & Chiến đấu] DOMContentLoaded đã kích hoạt. Bắt đầu initializeScript.');
        initializeScript();
    });

    // MutationObserver chỉ dùng để theo dõi sự xuất hiện của nút UI nếu nó không có lúc đầu,
    // và sẽ ngắt kết nối sau khi UI được tạo.
    uiObserver = new MutationObserver((mutations, obs) => {
        if (!isUIMade) {
            const changeButton = document.querySelector('button#change-element-button.change-element-button');
            if (changeButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] MutationObserver (UI): Đã phát hiện nút "Thay đổi" và UI chưa có. Đang cố gắng tạo UI.');
                createUI();
                // Ngắt kết nối observer này sau khi UI đã được tạo để tránh lặp lại không cần thiết
                if (isUIMade) {
                    obs.disconnect();
                    console.log('[Tự động Tối ưu & Chiến đấu] MutationObserver (UI) đã ngắt kết nối.');
                }
            }
        }
    });

    // Chỉ bắt đầu quan sát cho UI nếu DOM chưa hoàn chỉnh khi script tải
    if (document.readyState === 'loading') {
        console.log('[Tự động Tối ưu & Chiến đấu] Kích hoạt MutationObserver (UI) để quan sát nội dung động.');
        uiObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        // Nếu DOM đã hoàn chỉnh, thử tạo UI ngay lập tức
        console.log('[Tự động Tối ưu & Chiến đấu] DOM đã hoàn tất khi tải script. Thử tạo UI ngay.');
        createUI();
    }

})();
