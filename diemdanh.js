// ==UserScript==
// @name         HH3D Diem Danh
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Tự động nhấp nút "Điểm Danh" trên hoathinh3d.gg/diem-danh nếu chưa điểm danh.
// @author       Bạn
// @match        https://hoathinh3d.gg/diem-danh*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Diem Danh DEBUG] Script đã được tải.');

    // Hàm tiện ích để chờ một phần tử xuất hiện trong DOM
    function waitForElement(selector, callback, timeout = 10000) {
        console.log(`[Auto Diem Danh DEBUG] waitForElement: Đang chờ selector "${selector}" với timeout ${timeout/1000} giây.`);
        const element = document.querySelector(selector);
        if (element) {
            console.log(`[Auto Diem Danh DEBUG] waitForElement: Tìm thấy phần tử "${selector}" ngay lập tức.`);
            callback(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            console.log(`[Auto Diem Danh DEBUG] waitForElement: MutationObserver phát hiện thay đổi DOM.`);
            const foundElement = document.querySelector(selector);
            if (foundElement) {
                console.log(`[Auto Diem Danh DEBUG] waitForElement: MutationObserver đã tìm thấy phần tử "${selector}".`);
                callback(foundElement);
                obs.disconnect(); // Ngừng quan sát sau khi tìm thấy
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Đặt timeout để ngừng quan sát nếu không tìm thấy phần tử
        setTimeout(() => {
            if (document.querySelector(selector) === null) { // Chỉ log timeout nếu thực sự không tìm thấy
                observer.disconnect();
                console.warn(`[Auto Diem Danh DEBUG] waitForElement: HẾT THỜI GIAN CHỜ selector "${selector}" sau ${timeout/1000}s. Phần tử không được tìm thấy.`);
            }
        }, timeout);
    }

    // Chức năng chính để tự động nhấp nút điểm danh
    function autoClickDiemDanhButton() {
        console.log('[Auto Diem Danh DEBUG] Bắt đầu chức năng autoClickDiemDanhButton.');

        // Selector chính xác của nút dựa trên ID và class bạn cung cấp
        const specificButtonSelector = '#checkInButton.flambutt-on';
        console.log(`[Auto Diem Danh DEBUG] Selector mục tiêu: "${specificButtonSelector}".`);

        waitForElement(specificButtonSelector, (button) => {
            console.log('[Auto Diem Danh DEBUG] Hàm callback của waitForElement đã được gọi.');

            // Kiểm tra xem nút có hiển thị và không bị vô hiệu hóa
            const isButtonVisible = button && button.offsetParent !== null;
            const isButtonEnabled = button && !button.disabled && !button.classList.contains('disabled');

            console.log(`[Auto Diem Danh DEBUG] Nút tìm thấy: Có hiển thị? ${isButtonVisible}, Có được bật? ${isButtonEnabled}.`);

            if (isButtonVisible && isButtonEnabled) {
                console.log('[Auto Diem Danh DEBUG] Nút hiển thị và được bật. Kiểm tra văn bản nút.');
                const buttonTextSpan = button.querySelector('.button-text');
                const currentButtonText = buttonTextSpan ? buttonTextSpan.textContent.trim() : 'Không tìm thấy text span';

                console.log(`[Auto Diem Danh DEBUG] Văn bản hiện tại của nút: "${currentButtonText}".`);

                if (currentButtonText === 'Điểm Danh') {
                    console.log('[Auto Diem Danh DEBUG] Văn bản nút khớp với "Điểm Danh". Sẽ thử nhấp sau 0.7 giây.');
                    // Thêm một độ trễ nhỏ để đảm bảo trang ổn định
                    setTimeout(() => {
                        try {
                            button.click();
                            console.log('[Auto Diem Danh DEBUG] ĐÃ NHẤP NÚT "Điểm Danh" THÀNH CÔNG!');
                        } catch (e) {
                            console.error('[Auto Diem Danh DEBUG] LỖI khi nhấp nút:', e);
                        }
                    }, 700); // Độ trễ 0.7 giây
                } else {
                    console.log(`[Auto Diem Danh DEBUG] Văn bản nút không phải "Điểm Danh" ("${currentButtonText}"). Có thể đã điểm danh rồi.`);
                }
            } else {
                console.log('[Auto Diem Danh DEBUG] Nút không hiển thị hoặc không được bật (đã điểm danh hoặc vô hiệu hóa).');
            }
        }, 5000); // Timeout 5 giây cho việc tìm nút
    }

    // Chạy script khi trang được tải hoàn toàn
    window.addEventListener('load', () => {
        console.log('[Auto Diem Danh DEBUG] Sự kiện window.load đã kích hoạt. Bắt đầu quá trình tự động điểm danh.');
        autoClickDiemDanhButton();
    });
})();
