// ==UserScript==
// @name         HH3D Tông Môn (Tế Lễ - Siêu Ngắn Gọn)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Tự động click nút "Tế Lễ" và xác nhận trên trang Danh Sách Thành Viên Tông Môn. Không có log chi tiết.
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/danh-sach-thanh-vien-tong-mon*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CHECK_INTERVAL = 1000; // 1 giây
    const DELAY_BEFORE_CLICK = 750; // 0.75 giây

    let mainIntervalId = null;

    function safeClick(element) {
        if (!element || element.disabled || element.offsetParent === null) {
            return false;
        }
        try {
            element.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            return true;
        } catch (e) {
            return false;
        }
    }

    function checkAndTeLe() {
    const confirmButton = document.querySelector('button.swal2-confirm.swal2-styled.swal2-default-outline');
    const teLeButton = document.querySelector('button#te-le-button.btn.btn-danger.group-button');

    if (confirmButton && confirmButton.offsetParent !== null && !confirmButton.disabled) {
        setTimeout(() => {
            if (safeClick(confirmButton)) {
                clearInterval(mainIntervalId);
            }
        }, DELAY_BEFORE_CLICK);
        window._teleNotFoundCount = 0; // reset đếm nếu có nút
    } else if (teLeButton && teLeButton.offsetParent !== null && !teLeButton.disabled) {
        setTimeout(() => {
            safeClick(teLeButton);
        }, DELAY_BEFORE_CLICK);
        window._teleNotFoundCount = 0; // reset đếm nếu có nút
    } else {
        window._teleNotFoundCount = (window._teleNotFoundCount || 0) + 1;
        if (window._teleNotFoundCount >= 5) {
            clearInterval(mainIntervalId);
        }
    }
}

    window.addEventListener('load', () => {
         mainIntervalId = setInterval(checkAndTeLe, CHECK_INTERVAL);
    });

    if (document.readyState === 'complete') {
        if (!mainIntervalId) {
             mainIntervalId = setInterval(checkAndTeLe, CHECK_INTERVAL);
        }
    }

})();
