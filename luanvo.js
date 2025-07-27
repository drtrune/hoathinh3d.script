// ==UserScript==
// @name         HH3D Luận Võ
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Rút ngắn thời gian chờ trong Luận Võ
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/luan-vo-duong*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Luận Võ Speed Up] Script đã được tải.');

    // ===============================================
    // CẤU HÌNH & BIẾN TOÀN CỤC
    // ===============================================

    const SHORTENED_DELAY_SETTIMEOUT = 100; // 100ms (0.1 giây) cho setTimeout
    const SHORTENED_INTERVAL_DELAY = 10;   // 10ms (0.01 giây) cho setInterval

    // Trạng thái chung của tính năng speed up
    // Mặc định là TRUE (đã bật)
    let speedUpActive = true;

    // Lưu trữ các hàm setTimeout/setInterval gốc
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    // ===============================================
    // HÀM TIỆN ÍCH UI (CHO NÚT GẠT)
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
                justify-content: center; /* Căn giữa */
                gap: 10px;
                color: #bbb;
                font-size: 14px;
                user-select: none;
                width: 100%; /* Để justify-content hoạt động tốt */
            }

            /* CSS cho nút gạt (toggle switch) */
            .switch {
                position: relative;
                display: inline-block;
                width: 44px; /* Rộng hơn */
                height: 24px; /* Cao hơn */
            }

            /* Ẩn checkbox gốc */
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            /* Thanh trượt */
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                -webkit-transition: .4s;
                transition: .4s;
                border-radius: 24px; /* Hình tròn cho thanh trượt */
            }

            .slider:before {
                position: absolute;
                content: "";
                height: 16px; /* Kích thước nút gạt */
                width: 16px;
                left: 4px; /* Vị trí ban đầu của nút */
                bottom: 4px;
                background-color: white;
                -webkit-transition: .4s;
                transition: .4s;
                border-radius: 50%; /* Hình tròn cho nút gạt */
            }

            /* Khi checkbox được chọn */
            input:checked + .slider {
                background-color: #4CAF50; /* Màu xanh lá cây khi bật */
            }

            /* Bóng khi focus (nếu cần) */
            input:focus + .slider {
                box-shadow: 0 0 1px #4CAF50;
            }

            /* Di chuyển nút gạt khi được chọn */
            input:checked + .slider:before {
                -webkit-transform: translateX(20px); /* Di chuyển nút sang phải */
                -ms-transform: translateX(20px);
                transform: translateX(20px);
            }

            /* Hình tròn cho thanh trượt và nút */
            .slider.round {
                border-radius: 24px;
            }

            .slider.round:before {
                border-radius: 50%;
            }
        `);

        // Chờ cho element có class 'auto-accept-label' xuất hiện
        const targetElement = document.querySelector('.auto-accept-label');

        if (targetElement) {
            const container = document.createElement('div');
            container.className = 'speed-up-toggle-container';

            const labelText = document.createElement('label');
            labelText.textContent = 'Khiêu chiến nhanh';
            labelText.htmlFor = 'speedUpToggleSwitch'; // Liên kết với input

            const switchWrapper = document.createElement('label');
            switchWrapper.className = 'switch';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'speedUpToggleSwitch';
            checkbox.checked = speedUpActive; // Mặc định bật
            checkbox.addEventListener('change', (e) => {
                speedUpActive = e.target.checked;
                console.log(`[Luận Võ Speed Up] Chế độ "Khiêu chiến nhanh": ${speedUpActive ? 'Đã BẬT' : 'Đã TẮT'}`);
            });

            const slider = document.createElement('span');
            slider.className = 'slider round';

            switchWrapper.appendChild(checkbox);
            switchWrapper.appendChild(slider);

            container.appendChild(labelText);
            container.appendChild(switchWrapper);

            // Chèn container ngay sau targetElement
            targetElement.parentNode.insertBefore(container, targetElement.nextSibling);

            console.log('[Luận Võ Speed Up] Nút gạt đã được chèn vào DOM.');

        } else {
            console.warn('[Luận Võ Speed Up] Không tìm thấy phần tử .auto-accept-label để chèn nút gạt.');
        }
    }

    // ===============================================
    // HÀM XỬ LÝ CAN THIỆP
    // ===============================================

    // Ghi đè setTimeout để can thiệp
    window.setTimeout = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;
        let reason = '';

        // SweetAlert2 setTimeout (3000ms) - Tự động đóng hộp thoại
        // Chỉ can thiệp nếu speedUpActive đang TRUE
        // Callback: ()=>{o("timer"),delete e.timeout}
        if (speedUpActive && delay === 3000 && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('o("timer")') && callbackString.includes('delete e.timeout')) {
                const stack = new Error().stack;
                if (stack && stack.includes('sweetalert2.min.js')) { // Xác nhận nguồn gốc
                    actualDelay = SHORTENED_DELAY_SETTIMEOUT;
                    intervened = true;
                    reason = 'SweetAlert2 tự đóng';
                }
            }
        }

        if (intervened) {
            console.log(`[Luận Võ Speed Up] Đã can thiệp: Rút ngắn ${reason} từ ${delay}ms xuống ${actualDelay}ms.`);
        }
        return originalSetTimeout(callback, actualDelay, ...args);
    };

    // Ghi đè setInterval để can thiệp
    window.setInterval = function(callback, delay, ...args) {
        let actualDelay = delay;
        let intervened = false;
        let reason = '';

        // Can thiệp vào setInterval 1s của Hoạt ảnh chiến đấu (5s đếm ngược)
        // Chỉ can thiệp nếu speedUpActive đang TRUE
        // Callback: function(){--y>0?u.textContent=y:(clearInterval(window.countdownInterval),window.countdownInterval=null,t())}
        if (speedUpActive && delay === 1000 && typeof callback === 'function') {
            const callbackString = callback.toString();
            if (callbackString.includes('--y>0?') && callbackString.includes('clearInterval(window.countdownInterval)') && callbackString.includes('t()')) {
                 const stack = new Error().stack;
                 if (stack && stack.includes('luan-vo.min.js')) { // Xác nhận nguồn gốc
                    actualDelay = SHORTENED_INTERVAL_DELAY; // Rút ngắn delay giữa các lần chạy
                    intervened = true;
                    reason = 'Hoạt ảnh chiến đấu (5s)';
                 }
            }
        }

        if (intervened) {
            console.log(`[Luận Võ Speed Up] Đã can thiệp: Tăng tốc ${reason} từ ${delay}ms xuống ${actualDelay}ms.`);
        }
        // Trả về setInterval gốc với delay đã điều chỉnh (hoặc delay ban đầu nếu không can thiệp)
        return originalSetInterval(callback, actualDelay, ...args);
    };

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    function initializeSpeedUpScript() {
        // Đảm bảo DOM đã tải hoàn toàn để tìm thấy .auto-accept-label
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createToggleSwitchUI);
        } else {
            createToggleSwitchUI();
        }
    }

    // Luôn khởi tạo chức năng tạo UI và can thiệp
    initializeSpeedUpScript();

})();
