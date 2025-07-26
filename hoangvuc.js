// ==UserScript==
// @name         HoatHinh3D Auto Hoang vực
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Tự động nhận thưởng. Tự động tối ưu ngũ hành và chiến đấu theo chu kỳ.
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
    let currentPriority = localStorage.getItem(LOCAL_STORAGE_KEY) || 'no-decrease'; // Default to 'no-decrease'
    let isUIMade = false;
    let isScriptFullyInitialized = false; // Flag to ensure initializeScript runs only once

    // Variable to store ID of setTimeout/setInterval for potential clearing
    let currentTimerId = null;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    // Cập nhật trạng thái hiển thị trên UI
    function updateScriptStatus(message) {
        const statusElement = document.getElementById('scriptStatus');
        if (statusElement) {
            statusElement.textContent = `Trạng thái: ${message}`;
            console.log(`[Tự động Tối ưu & Chiến đấu] Cập nhật trạng thái: ${message}`);
        } else {
            console.log(`[Tự động Tối ưu & Chiến đấu] Trạng thái: ${message} (Không tìm thấy phần tử status UI)`);
        }
    }

    // Utility function to wait for an element to appear stably in the DOM
    function waitForElementStable(selector, callback, timeout = 10000, interval = 500) { // Reduced default timeout to 10s
        let startTime = Date.now();
        let foundElement = null;
        let checkCount = 0;

        const intervalId = setInterval(() => {
            foundElement = document.querySelector(selector);
            checkCount++;

            // Check if element is found, is visible (offsetParent not null), and not disabled
            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                console.log(`[Tự động Tối ưu & Chiến đấu] waitForElementStable: Đã tìm thấy "${selector}" và hiển thị/không disabled trong ${Date.now() - startTime}ms (sau ${checkCount} lần kiểm tra).`);
                clearInterval(intervalId);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                console.warn(`[Tự động Tối ưu & Chiến đấu] waitForElementStable: HẾT THỜI GIAN chờ "${selector}" sau ${timeout/1000}s. Phần tử không tìm thấy, không hiển thị hoặc bị disabled.`);
                clearInterval(intervalId);
                callback(null); // Call with null to indicate timeout
            }
        }, interval);
    }

    // Safe click function that tries MouseEvent then direct click
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            console.error(`[Tự động Tối ưu & Chiến đấu] LỖI: Không thể click vì ${elementName} là null.`);
            updateScriptStatus(`Lỗi: Không click được ${elementName}.`);
            return false;
        }
        if (element.disabled) {
            console.warn(`[Tự động Tối ưu & Chiến đấu] CẢNH BÁO: ${elementName} bị disabled, không thể click.`);
            updateScriptStatus(`${elementName} bị khóa.`);
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
            updateScriptStatus(`Đã click ${elementName}.`);
            return true;
        } catch (e) {
            console.warn(`[Tự động Tối ưu & Chiến đấu] LỖI khi dispatch MouseEvent cho ${elementName}:`, e, "Thử cách click trực tiếp.");
            try {
                element.click();
                console.log(`[Tự động Tối ưu & Chiến đấu] Đã click trực tiếp ${elementName}.`);
                updateScriptStatus(`Đã click ${elementName} (trực tiếp).`);
            } catch (e2) {
                console.error(`[Tự động Tối ưu & Chiến đấu] LỖI KHÔNG THỂ CLICK ${elementName} (cả 2 cách):`, e2);
                updateScriptStatus(`Lỗi nghiêm trọng: Không click được ${elementName}.`);
                return false;
            }
        }
    }

    // Function to get current damage status (decrease, increase, or none)
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

    // Function to parse cooldown time from the timer element
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

    // ===============================================
    // HÀM XỬ LÝ GAMEPLAY
    // ===============================================

    // Clicks the reward close button and then waits for the modal to truly disappear
    function clickRewardCloseButtonAndThenWaitForModalToClose(callback) {
        updateScriptStatus('Đang đóng hộp thoại thưởng...');
        // First, explicitly look for the "reward-close" button within the success modal
        waitForElementStable('div.reward-notification.success button.reward-close', (closeButton) => {
            if (closeButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] Đã tìm thấy nút "reward-close". Đang click để đóng hộp thoại.');
                setTimeout(() => {
                    if (safeClick(closeButton, 'nút "reward-close"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "reward-close" THÀNH CÔNG! Đang chờ hộp thoại biến mất.');
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

    // Waits for a modal (dialog) to close by checking its disappearance
    function waitForModalToClose(callback, modalName = 'hộp thoại') {
        updateScriptStatus(`Đang chờ ${modalName} đóng...`);
        // Use more specific selectors for reward/dialog modals, plus generic ones as fallback
        const modalSelector = 'div.reward-notification.success, div.swal2-container.swal2-center.swal2-backdrop-show, .modal-backdrop, .modal.show';
        let checkAttempts = 0;
        const maxAttempts = 20; // Check up to 20 times (20 * 300ms = 6 seconds)
        const checkInterval = 300; // Check every 300ms

        console.log(`[Tự động Tối ưu & Chiến đấu] Đang chờ ${modalName} đóng...`);

        const intervalId = setInterval(() => {
            const modalElement = document.querySelector(modalSelector);
            checkAttempts++;

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

    // Function to handle element change and confirmation
    function changeElementAndConfirm() {
        updateScriptStatus('Đang thay đổi ngũ hành...');
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
                                            checkRemainingAttacksThenContinue(); // Back to main loop after element change
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

    // Initiates battle by clicking "Khiêu chiến"
    function startBattleNow() {
        updateScriptStatus('Đang khiêu chiến...');
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
                        setTimeout(checkRemainingAttacksThenContinue, 2000); // Retry main loop
                    }
                }, 1000);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Nút "Khiêu chiến" không thể tìm thấy hoặc hiển thị. Sẽ kiểm tra lại sớm.');
                setTimeout(checkRemainingAttacksThenContinue, 2000); // Retry main loop
            }
        }, 10000);
    }

    // Clicks the "Tấn Công" button
    function clickAttackButton() {
        updateScriptStatus('Đang tấn công...');
        console.log('[Tự động Tối ưu & Chiến đấu] Đang cố gắng nhấp nút "Tấn Công".');
        const attackButtonSelector = 'button.attack-button';

        waitForElementStable(attackButtonSelector, (attackButton) => {
            if (attackButton) {
                setTimeout(() => {
                    if (safeClick(attackButton, 'nút "Tấn Công"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Tấn Công" THÀNH CÔNG! Trận chiến bây giờ sẽ bắt đầu.');
                        // After initiating attack, wait for post-battle state (reward/back button)
                        setTimeout(() => {
                            checkPostBattleState();
                        }, 2000); // Give a bit of time for battle to conclude or state to change
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

    // Checks post-battle state (Reward or Back button)
    function checkPostBattleState() {
        updateScriptStatus('Đang chờ kết quả trận đấu...');
        console.log('[Tự động Tối ưu & Chiến đấu] Đang kiểm tra trạng thái sau trận đấu: tìm nút "Nhận thưởng" hoặc "Trở lại".');

        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] Đã tìm thấy nút "Nhận thưởng". Đang click để nhận thưởng.');
                updateScriptStatus('Đã tìm thấy: Nhận thưởng.');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Nhận thưởng" THÀNH CÔNG! Đang chờ hộp thoại đóng...');
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại nhận thưởng đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                            checkRemainingAttacksThenContinue(); // Back to main loop after collecting reward
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
        }, 7000); // Timeout for reward button
    }

    // Clicks the "Trở lại" button
    function clickBackButton() {
        updateScriptStatus('Đang đóng hộp thoại...');
        console.log('[Tự động Tối ưu & Chiến đấu] Đang cố gắng nhấp nút "Trở lại" để đóng hộp thoại.');
        const backButtonSelector = 'button.back-button';

        waitForElementStable(backButtonSelector, (backButton) => {
            if (backButton) {
                setTimeout(() => {
                    if (safeClick(backButton, 'nút "Trở lại"')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Trở lại" THÀNH CÔNG! Hộp thoại đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                        waitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại trở lại đã đóng. Quay lại kiểm tra trạng thái lượt đánh.');
                            checkRemainingAttacksThenContinue(); // Back to main loop after clicking back
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

    // Checks remaining attacks and decides whether to continue the cycle or stop
    function checkRemainingAttacksThenContinue() {
        updateScriptStatus('Kiểm tra lượt đánh...');
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
                    updateScriptStatus('HẾT LƯỢT ĐÁNH. Dừng script.');
                    if (currentTimerId) clearTimeout(currentTimerId); // Clear any pending timers
                    return; // Stop script completely
                }
            } else {
                console.warn(`[Tự động Tối ưu & Chiến đấu] Không thể đọc số lượt đánh còn lại từ văn bản: "${attacksText}". Vẫn tiếp tục chu kỳ.`);
                updateScriptStatus(`Không đọc được lượt đánh. Tiếp tục...`);
            }
        } else {
            console.warn('[Tự động Tối ưu & Chiến đấu] Không tìm thấy phần tử hiển thị lượt đánh còn lại. Vẫn tiếp tục chu kỳ.');
            updateScriptStatus(`Không tìm thấy lượt đánh. Tiếp tục...`);
        }

        // If attacks remain or could not be read, continue with the battle cycle
        startBattleCycle();
    }

    // Main battle loop: checks cooldown, then processes element and battle
    function startBattleCycle() {
        updateScriptStatus('Kiểm tra hồi chiêu...');
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu vòng lặp chiến đấu: Kiểm tra cooldown.');

        waitForElementStable('#countdown-timer', (cooldownTimerElement) => {
            const cooldownMs = getCooldownTimeFromElement(cooldownTimerElement);
            if (cooldownMs > 0) {
                const waitTime = cooldownMs + 2000; // Reduced buffer to 2 seconds
                console.log(`[Tự động Tối ưu & Chiến đấu] Phát hiện hồi chiêu. Đang chờ ${waitTime / 1000} giây trước khi thử lại.`);
                updateScriptStatus(`Đang chờ hồi chiêu (${Math.ceil(waitTime / 1000)}s)...`);
                if (currentTimerId) clearTimeout(currentTimerId); // Clear old timer
                currentTimerId = setTimeout(() => {
                    console.log('[Tự động Tối ưu & Chiến đấu] Hồi chiêu đã kết thúc. Đang kiểm tra lại trạng thái lượt đánh.');
                    checkRemainingAttacksThenContinue(); // Re-enter loop after cooldown
                }, waitTime);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] Không có hồi chiêu đang hoạt động. Tiến hành logic ngũ hành và chiến đấu.');
                processElementAndBattle();
            }
        }, 7000); // Timeout for cooldown timer
    }

    // Processes elemental optimization based on user priority and then starts battle
    function processElementAndBattle() {
        updateScriptStatus('Kiểm tra ngũ hành...');
        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình chính: Kiểm tra Ngũ hành -> Thay đổi nếu cần -> Khiêu chiến -> Tấn Công.');
        const currentDamageStatus = getDamageStatus(); // 'decrease', 'increase', or 'none'

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
                console.warn(`[Tự động Tối ưu & Chiến đấu] Sát thương KHÔNG được tăng (trạng thái: ${currentDamageStatus}). Bắt đầu thay đổi ngũ hành để cố gắng tăng.`);
                changeElementAndConfirm();
            }
        }
    }

    // ===============================================
    // GIAO DIỆN NGƯỜI DÙNG (UI)
    // ===============================================

    // Adds CSS styles to the page
    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // Creates the UI for elemental priority selection and script status
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
            #scriptStatus {
                font-size: 11px;
                color: #B0C4DE; /* Light steel blue */
                margin-top: 3px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 190px;
            }
        `);

        // Use waitForElementStable to place the UI correctly
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
                    <span id="scriptStatus">Trạng thái: Đang khởi tạo...</span>
                `;
                targetButton.parentNode.insertBefore(configDiv, targetButton);

                const selectElement = configDiv.querySelector('#elementPriority');
                selectElement.value = currentPriority;

                selectElement.addEventListener('change', (event) => {
                    currentPriority = event.target.value;
                    localStorage.setItem(LOCAL_STORAGE_KEY, currentPriority);
                    console.log(`[Tự động Tối ưu & Chiến đấu] Ưu tiên ngũ hành đã thay đổi thành: ${currentPriority} và đã lưu.`);
                    updateScriptStatus(`Ưu tiên: ${currentPriority === 'no-decrease' ? 'Không giảm' : 'Tìm tăng'}`);
                });

                isUIMade = true;
                console.log('[Tự động Tối ưu & Chiến đấu] UI đã được tạo và căn giữa phía trên nút "Thay đổi".');
                updateScriptStatus('Sẵn sàng.');
            } else if (isUIMade) {
                console.log('[Tự động Tối ưu & Chiến đấu] UI đã được tạo, bỏ qua.');
            } else {
                console.warn('[Tự động Tối ưu & Chiến đấu] Không tìm thấy nút mục tiêu cho UI hoặc UI đã tồn tại. UI sẽ không được tạo.');
            }
        }, 10000);
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    // Main initialization function for the script
    function initializeScript() {
        if (isScriptFullyInitialized) {
            console.log('[Tự động Tối ưu & Chiến đấu] initializeScript đã được gọi. Bỏ qua lần này.');
            return;
        }
        isScriptFullyInitialized = true;

        console.log('[Tự động Tối ưu & Chiến đấu] Bắt đầu quá trình khởi tạo script (lần đầu).');
        updateScriptStatus('Đang khởi tạo...');

        // Create UI first
        createUI();

        // Check initial state: Is there a reward to claim? Or is the boss sealed?
        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Phát hiện nút "Nhận thưởng". Đang click...');
                updateScriptStatus('Khởi tạo: Nhận thưởng...');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng" khởi động')) {
                        console.log('[Tự động Tối ưu & Chiến đấu] ĐÃ NHẤP nút "Nhận thưởng" THÀNH CÔNG! Đang chờ hộp thoại đóng...');
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            console.log('[Tự động Tối ưu & Chiến đấu] Hộp thoại nhận thưởng đã đóng. Boss đã chết và thưởng đã được nhận. Bắt đầu chu kỳ chiến đấu mới.');
                            checkRemainingAttacksThenContinue(); // Start normal cycle
                        });
                    } else {
                        console.error('[Tự động Tối ưu & Chiến đấu] LỖI khi nhấp nút "Nhận thưởng" khi khởi động. Tiếp tục kiểm tra trạng thái.');
                        checkRemainingAttacksThenContinue(); // Continue to battle cycle if reward click fails
                    }
                }, 500);
            } else {
                console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Không tìm thấy nút "Nhận thưởng". Kiểm tra trạng thái "Boss chưa mở Phong Ấn".');
                const bossSealedElement = document.querySelector('div.highlight-text-box');
                if (bossSealedElement && bossSealedElement.textContent.includes('Boss chưa mở Phong Ấn')) {
                    console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Phát hiện "Boss chưa mở Phong Ấn". Boss đã chết và thưởng đã nhận. Script sẽ DỪNG tại đây.');
                    updateScriptStatus('Boss đã chết. Dừng.');
                    // Script naturally stops here if boss is sealed, as no battles can be initiated.
                } else {
                    console.log('[Tự động Tối ưu & Chiến đấu] KHỞI ĐỘNG: Boss có thể khiêu chiến được. Bắt đầu kiểm tra lượt đánh và logic chiến đấu.');
                    checkRemainingAttacksThenContinue(); // Start the main battle cycle
                }
            }
        }, 7000); // Timeout for reward button check at startup
    }

    // --- Entry Point ---
    // Use DOMContentLoaded to ensure basic DOM is ready before trying to initialize
    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Tự động Tối ưu & Chiến đấu] DOMContentLoaded đã kích hoạt. Bắt đầu initializeScript.');
        initializeScript();
    });

    // Fallback MutationObserver for dynamic content if DOMContentLoaded is too early
    const uiObserver = new MutationObserver((mutations, obs) => {
        // If UI hasn't been made yet, check for the button to attach UI
        if (!isUIMade) {
            const changeButton = document.querySelector('button#change-element-button.change-element-button');
            if (changeButton) {
                console.log('[Tự động Tối ưu & Chiến đấu] MutationObserver (UI): Đã phát hiện nút "Thay đổi" và UI chưa có. Đang cố gắng tạo UI.');
                createUI();
                if (isUIMade) { // If UI was successfully made
                    obs.disconnect(); // Disconnect this observer as its job is done
                    console.log('[Tự động Tối ưu & Chiến đấu] MutationObserver (UI) đã ngắt kết nối.');
                }
            }
        }
        // Also, if the script hasn't fully initialized, try to initialize it once key elements appear
        if (!isScriptFullyInitialized) {
            if (document.querySelector('#countdown-timer') ||
                document.querySelector('div.damage-info') ||
                document.querySelector('button.battle-button#battle-button'))
            {
                console.log('[Tự động Tối ưu & Chiến đấu] MutationObserver (Init): Key elements detected. Attempting script initialization.');
                initializeScript();
                // We don't disconnect this observer immediately, as `initializeScript` handles its own `isScriptFullyInitialized` flag.
                // The main loop will then manage itself.
            }
        }
    });

    // Start observing the body for changes
    console.log('[Tự động Tối ưu & Chiến đấu] Kích hoạt MutationObserver để quan sát nội dung động.');
    uiObserver.observe(document.body, { childList: true, subtree: true });

})();
