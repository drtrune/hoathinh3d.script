// ==UserScript==
// @name         HH3D - Menu Tùy Chỉnh
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      1.1
// @description  Chỉ thêm nút menu tuỳ chỉnh
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[HH3D Script] Tải thành công. Đang khởi tạo UI tùy chỉnh.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    const TIMEOUT_ELEMENT_STABLE = 5000; // Thời gian tối đa chờ một phần tử xuất hiện ổn định
    const INTERVAL_ELEMENT_STABLE = 500; // Khoảng thời gian giữa các lần kiểm tra phần tử
    const weburl = 'https://hoathinh3d.mx/'
    const LINK_GROUPS = [
        {
            name: 'Tế lễ, vấn đáp, điểm danh',
            links: [
                { text: 'Tế Lễ', url: weburl + 'danh-sach-thanh-vien-tong-mon' },
                { text: 'Vấn Đáp', url: weburl + 'van-dap-tong-mon' },
                { text: 'Điểm Danh', url: weburl + 'diem-danh' }
            ]
        },
        {
            name: 'Hoang Vực, Thí Luyện, Phúc Lợi, Bí Cảnh',
            links: [
                { text: 'Hoang Vực', url: weburl + 'hoang-vuc' },
                { text: 'Thí Luyện', url: weburl + 'thi-luyen-tong-mon-hh3d' },
                { text: 'Phúc Lợi', url: weburl + 'phuc-loi-duong' },
                { text: 'Bí Cảnh', url: weburl + 'bi-canh-tong-mon' }
            ]
        },
        {
            name: 'Luận võ',
            links: [
                { text: 'Luận Võ', url: weburl + 'luan-vo-duong' },
            ]
        },
        {
            name: 'Khoáng Mạch',
            links: [
                { text: 'Khoáng Mạch', url: 'khoang-mach' }
            ]
        }
    ];
    /**
     * Chờ một phần tử DOM ổn định (hiển thị và không bị vô hiệu hóa).
     * @param {string} selector - CSS selector của phần tử cần tìm.
     * @param {function} callback - Hàm sẽ được gọi khi phần tử được tìm thấy hoặc hết thời gian chờ.
     * @param {number} timeout - Thời gian chờ tối đa (ms).
     * @param {number} interval - Khoảng thời gian giữa các lần kiểm tra (ms).
     */
    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let intervalId;

        intervalId = setInterval(() => {
            const foundElement = document.querySelector(selector);
            const elapsedTime = Date.now() - startTime;

            // Kiểm tra nếu phần tử tồn tại, hiển thị và không bị vô hiệu hóa
            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                clearInterval(intervalId);
                callback(foundElement);
            } else if (elapsedTime >= timeout) {
                // Hết thời gian chờ, không tìm thấy phần tử
                clearInterval(intervalId);
                callback(null);
            }
        }, interval);
    }

    /**
     * Thêm CSS tùy chỉnh vào trang.
     * @param {string} css - Chuỗi CSS cần thêm.
     */
    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // ===============================================
    // HÀM TẠO UI NÚT MENU TÙY CHỈNH
    // ===============================================

    /**
     * Tạo và chèn nút menu tùy chỉnh bên cạnh nút thông báo.
     * Nút này sẽ mô phỏng cấu trúc và kiểu dáng của các nút điều hướng hiện có.
     */
    function createCustomMenuButton() {
        // Thêm các style CSS cho menu thả xuống
        addStyle(`
            /* Style chung cho menu thả xuống */
            .custom-script-menu {
                display: flex !important; /* Đảm bảo menu sử dụng flexbox */
                flex-wrap: nowrap !important; /* Không cho phép wrap, giữ menu trong một dòng */
                flex-direction: column !important; /* Đặt menu theo chiều dọc */
                position: absolute;
                background-color: #242323ff;
                min-width: 250px;
                z-index: 1001; /* Đảm bảo menu hiển thị trên các phần tử khác */
                border-radius: 5px;
                top: calc(100% + 5px); /* Đặt menu bên dưới nút */
                right: 0; /* Căn phải với nút cha */
                padding: 5px 0;
                gap: 6px; /* Khoảng cách giữa các mục menu */
            }
            .custom-script-menu.hidden {
                visibility: hidden;
                opacity: 0;
                pointer-events: none; /* ngăn click vào khi ẩn */
                transition: opacity 0.2s ease;
            }
            /* Style cho các mục trong menu */
            .custom-script-menu a {
                color: black;
                /* Điều chỉnh padding và font-size tại đây để giảm kích thước */
                padding: 20px 10px!important ; /* Giảm padding */
                font-size: 13px !important;   /* Thêm !important để ép buộc áp dụng font-size */
                text-decoration: none;
                border-radius: 5px;
                display: block;
                height: 40px; /* Giảm chiều cao của mỗi mục */
                text-align: left;
                align-items: center;
            }
            .custom-script-menu a:hover {
                box-shadow: 0 0 15px rgba(52, 152, 219, 0.7);
            }
            /* Optional: Điều chỉnh khoảng cách nếu nút mới quá sát các nút khác */
            /* .nav-items > .custom-script-item-wrapper {
                margin-left: 5px;
            } */
        `);

        // Selector của phần tử chứa nút thông báo (div.load-notification relative)
        const notificationsDivSelector = '.load-notification.relative';

        // Chờ phần tử này xuất hiện và ổn định
        waitForElementStable(notificationsDivSelector, (notificationsDiv) => {
            if (notificationsDiv) {
                // Lấy phần tử cha của nút thông báo, đây là nơi chúng ta sẽ chèn nút mới
                const parentNavItems = notificationsDiv.parentNode;

                // Đảm bảo phần tử cha là thanh điều hướng chính
                if (parentNavItems && parentNavItems.classList.contains('nav-items')) {
                    // 1. Tạo wrapper cho nút menu tùy chỉnh, mô phỏng cấu trúc của nút thông báo
                    const customMenuWrapper = document.createElement('div');
                    // Áp dụng các class tương tự để kế thừa style và flexbox layout
                    customMenuWrapper.classList.add('load-notification', 'relative', 'custom-script-item-wrapper');

                    // 2. Tạo thẻ <a> cho nút chính (giống như các nút nav khác)
                    const newMenuButton = document.createElement('a');
                    newMenuButton.href = '#';
                    newMenuButton.setAttribute('data-view', 'hide'); // Mô phỏng thuộc tính của các nút khác

                    // 3. Tạo div chứa icon (bên trong thẻ <a>)
                    const iconDiv = document.createElement('div');
                    const iconSpan = document.createElement('span');
                    iconSpan.classList.add('material-icons-round1', 'material-icons-menu');
                    iconSpan.textContent = 'task'; // Icon Material Icons cho menu script

                    iconDiv.appendChild(iconSpan);
                    newMenuButton.appendChild(iconDiv);

                    // 4. Tạo menu thả xuống
                    const dropdownMenu = document.createElement('div');
                    dropdownMenu.className = 'custom-script-menu';
                    dropdownMenu.classList.toggle('hidden'); // Bắt đầu ở trạng thái ẩn

                    // 5. Thêm các mục vào menu thả xuống
                    LINK_GROUPS.forEach(group => {
                        const menuItem = document.createElement('a');
                        menuItem.href = '#';
                        // Lấy tên của mục menu trực tiếp từ dữ liệu
                        menuItem.textContent = group.name;

                        // Tạo một hàm onclick duy nhất, sử dụng lại cho tất cả các mục
                        menuItem.onclick = function(e) {
                            e.preventDefault();
                            console.log(`%c[HH3D Script] Đang mở nhóm: ${group.name}`, 'color: #8A2BE2;');

                            // Vòng lặp qua các link trong group tương ứng
                            for (const link of group.links) {
                                window.open(link.url, '_blank');
                            }
                        };
                        // Thêm mục vào menu
                        dropdownMenu.appendChild(menuItem);
                    });


                    // Gắn nút bấm và menu vào wrapper
                    customMenuWrapper.appendChild(newMenuButton);
                    customMenuWrapper.appendChild(dropdownMenu);

                    // Chèn wrapper nút menu mới vào DOM, ngay sau div.load-notification relative
                    parentNavItems.insertBefore(customMenuWrapper, notificationsDiv.nextSibling);

                    console.log('%c[HH3D Script] Đã chèn nút menu tùy chỉnh thành công.', 'color: lightgreen;');

                    // 6. Xử lý sự kiện click để bật/tắt menu
                    newMenuButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        dropdownMenu.classList.toggle('hidden');
                        if (dropdownMenu.classList.contains('hidden')) {
                            iconSpan.textContent = 'task'; // Đổi icon thành "cancel" khi mở menu
                        } else {
                            iconSpan.textContent = 'highlight_off'; // Đổi icon về "task" khi đóng menu
                        };
                    });

                    // 7. Đóng menu khi click ra ngoài
                    document.addEventListener('click', function(e) {
                        if (!customMenuWrapper.contains(e.target)) { // Kiểm tra xem click có nằm ngoài wrapper nút không
                            dropdownMenu.classList.add('hidden');
                        }
                    });

                } else {
                    console.warn('%c[HH3D Script - Cảnh báo] Không tìm thấy phần tử cha ".nav-items" của nút thông báo. Không thể chèn menu.', 'color: orange;');
                }
            } else {
                console.warn('%c[HH3D Script - Cảnh báo] Không tìm thấy div ".load-notification.relative" để chèn menu cạnh. Menu sẽ không được hiển thị.', 'color: orange;');
            }
        }, 10000); // Tăng thời gian chờ nếu trang load chậm
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    console.log('%c[HH3D Script] Đang chờ DOMContentLoaded để khởi tạo UI.', 'color: #8A2BE2;');

    // Lắng nghe sự kiện DOMContentLoaded để đảm bảo DOM đã sẵn sàng
    window.addEventListener('DOMContentLoaded', () => {
        createCustomMenuButton(); // Gọi hàm tạo nút menu tùy chỉnh
    });

    // Fallback cho trường hợp DOMContentLoaded đã bắn trước khi script kịp gán listener
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createCustomMenuButton();
    }

    // MutationObserver (giúp theo dõi thay đổi DOM, có thể giữ lại nếu bạn cần debug)
    const observer = new MutationObserver((mutationsList, observer) => {
        // console.log('[HH3D Script - Debug] DOM Mutation detected.', mutationsList);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    console.log('%c[HH3D Script] Thiết lập ban đầu hoàn tất.', 'color: #8A2BE2;');

})();
