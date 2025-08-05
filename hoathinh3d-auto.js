// ==UserScript==
// @name         Hoathinh3D Auto
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      1.1
// @description  Tool tự động cho trang hoathinh3d
// @author       Dr. Trune
// @match        https://hoathinh3d.*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/drtrune/hoathinh3d.script/refs/heads/main/';
    const currentUrl = window.location.href;

    // Cấu hình các userscript và điều kiện tải của chúng
    // 'urlPath': Nếu được cung cấp, script chỉ tải khi URL hiện tại chứa chuỗi này.
    //            Nếu là null, script là "chung" và sẽ tải khi không có URL cụ thể nào khớp.
    const scriptConfig = {
        'khoangmach.js': {
            description: 'Script tự động khai thác tài nguyên.',
            urlPath: '/khoang-mach'
        },
        'phongcuoi.js': {
            description: 'Script hỗ trợ nhận phúc lợi hoặc buff.',
            urlPath: '/phong-cuoi'
        },
        'diemdanh.js': {
            description: 'Script tự động điểm danh hàng ngày.',
            urlPath: '/diem-danh'
        },
        'hoangvuc.js': {
            description: 'Script hỗ trợ các hoạt động liên quan đến Hoang Vực.',
            urlPath: '/hoang-vuc'
        },
        'hoatdonghangngay.js': {
            description: 'Script tự động thực hiện các hoạt động hàng ngày.',
            urlPath: '/bang-hoat-dong-ngay'
        },
        'luanvo.js': {
            description: 'Script hỗ trợ các chức năng liên quan đến Luận Võ.',
            urlPath: '/luan-vo-duong'
        },
        'phucloi.js': {
            description: 'Script tự động nhận các phúc lợi hoặc quà tặng.',
            urlPath: '/phuc-loi-duong'
        },
        'vandap.js': {
            description: 'Script hỗ trợ các câu hỏi và trả lời hoặc tương tác.',
            urlPath: '/van-dap-tong-mon'
        },
        'tele.js': {
            description: 'Script tự động tế lễ',
            urlPath: '/danh-sach-thanh-vien-tong-mon'
        },
        'dothach.js': {
            description: 'Script tự động đổ thạch tỷ lệ cược lớn nhất',
            urlPath: '/do-thach-hh3d'
        },
        'bicanh.js': {
            description: 'Script tự động đánh bí cảnh',
            urlPath: '/bi-canh-tong-mon'
        },
        'thiluyentongmon.js': {
            description: 'Script tự động thí luyện tông môn',
            urlPath: '/thi-luyen-tong-mon-hh3d'
        },
    };

    let scriptsToLoadOnThisPage = [];
    let isSpecificPageMatched = false;

    // Bước 1: Kiểm tra các script có điều kiện theo URL
    // Nếu URL hiện tại khớp với bất kỳ 'urlPath' nào, chỉ các script đó sẽ được xem xét.
    for (const scriptName in scriptConfig) {
        const config = scriptConfig[scriptName];
        if (config.urlPath && currentUrl.includes(config.urlPath)) {
            scriptsToLoadOnThisPage.push(scriptName);
            isSpecificPageMatched = true;
        }
    }

    // Bước 2: Nếu không có trang cụ thể nào khớp (isSpecificPageMatched vẫn là false),
    // thì tải tất cả các script "chung" (những script có urlPath là null).
    if (!isSpecificPageMatched) {
        for (const scriptName in scriptConfig) {
            const config = scriptConfig[scriptName];
            if (config.urlPath === null) {
                scriptsToLoadOnThisPage.push(scriptName);
            }
        }
    }

    /**
     * Tải và thực thi một userscript từ URL đã cho.
     * @param {string} scriptName Tên của userscript (ví dụ: 'blessing.js').
     */
    function loadUserscript(scriptName) {
        const url = GITHUB_BASE_URL + scriptName;
        console.log(`Đang cố gắng tải userscript: ${url}`);

        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                if (response.status === 200) {
                    const scriptContent = response.responseText;
                    const scriptElement = document.createElement('script');
                    scriptElement.textContent = scriptContent;
                    document.head.appendChild(scriptElement);
                    console.log(`Userscript '${scriptName}' đã được tải và thực thi thành công.`);
                } else {
                    console.error(`Lỗi khi tải userscript '${scriptName}' từ ${url}. Mã trạng thái: ${response.status}`);
                }
            },
            onerror: function(error) {
                console.error(`Lỗi kết nối khi tải userscript '${scriptName}' từ ${url}. Chi tiết:`, error);
            },
            onabort: function() {
                console.warn(`Yêu cầu tải userscript '${scriptName}' từ ${url} đã bị hủy.`);
            }
        });
    }

    // Tải từng userscript trong danh sách đã xác định cho trang này
    if (scriptsToLoadOnThisPage.length > 0) {
        console.log(`Scripts sẽ được tải trên trang này: ${scriptsToLoadOnThisPage.join(', ')}`);
        scriptsToLoadOnThisPage.forEach(scriptName => {
            loadUserscript(scriptName);
        });
    } else {
        console.log('Không có script nào được cấu hình để tải trên trang này.');
    }

    console.log('All-in-One Game Scripts (main loader) đã được tải và đang chạy.');

})();
