// ==UserScript==
// @name         hh3d-Tự-giải-vấn-đáp-Full-Logging
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  Tự động giải Vấn Đáp Tổng Môn trên Hoathinh3d.gg với tính năng logging đầy đủ để debug.
// @author       ChatGPT & You
// @match        https://hoathinh3d.gg/van-dap-tong-mon*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    // --- Ưu tiên chạy lệnh vô hiệu hóa Developer Tools ---
    try {
        if (typeof DisableDevtool !== 'undefined' && DisableDevtool.isSuspend !== undefined) {
            DisableDevtool.isSuspend = true;
        }
    } catch (e) {
        // Lỗi khi cố gắng tắt DisableDevtool
    }

    // --- Cấu hình ---
    const QUESTION_DATA_URL = 'https://raw.githubusercontent.com/drtrune/hoathinh3d.script/main/vandap.json';
    const CACHE_DURATION = 3600 * 1000; // 1 giờ (tính bằng miligiây)
    const CHECK_INTERVAL = 500; // Kiểm tra mỗi 0.5 giây
    const DELAY_AFTER_START_CLICK = 1500; // Thời gian chờ sau khi click BẮT ĐẦU VẤN ĐÁP
    const DELAY_AFTER_ANSWER_CLICK = 500; // Thời gian chờ sau khi click đáp án (để web kịp chuyển câu)
    const MAX_WAIT_FOR_NEW_QUESTION = 5000; // Thời gian tối đa chờ câu hỏi mới (5 giây)

    // --- Biến Trạng Thái ---
    let questionDataCache = null;
    let quizStarted = false;
    let questionsAnsweredCount = 0;
    let mainIntervalId = null;
    let isFetchingQuestions = false;
    let lastQuestionText = ''; // Biến để lưu câu hỏi cuối cùng
    let waitForNewQuestionTimeout = null; // Timeout cho việc chờ câu hỏi mới

    // --- Các Hàm Hỗ Trợ ---

    /**
     * Ghi log ra console với tiền tố và cấp độ (info, warn, error).
     * @param {string} message - Tin nhắn cần log.
     * @param {string} level - Cấp độ log ('info', 'warn', 'error'). Mặc định là 'info'.
     */
    function log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
        const prefix = `[HoatHinh3D][${timestamp}]`;
        switch (level) {
            case 'warn':
                console.warn(`${prefix} ${message}`);
                break;
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }

    /**
     * Cập nhật lớp phủ hiển thị trạng thái và thông tin.
     * @param {string} questionText - Nội dung câu hỏi.
     * @param {string} answerText - Đáp án tìm được.
     * @param {string} statusText - Trạng thái hiện tại của script.
     * @param {string} methodText - Phương pháp tìm kiếm (VD: "Chính xác", "Tương đối").
     */
    function updateAnswerOverlay(questionText, answerText, statusText, methodText) {
        let overlay = document.getElementById('hh3d-answer-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hh3d-answer-overlay';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '10px',
                right: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '15px',
                borderRadius: '8px',
                zIndex: '99999',
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                maxWidth: '300px',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
            });
            document.body.appendChild(overlay);
            log('Overlay created.');
        }

        overlay.innerHTML = `
            <p><strong>Trạng thái:</strong> <span style="color: yellow;">${statusText}</span></p>
            <p><strong>Câu hỏi:</strong> <span style="color: lightblue;">${questionText}</span></p>
            <p><strong>Đáp án:</strong> <span style="color: lightgreen;">${answerText}</span></p>
            <p><strong>Cách tìm:</strong> <em>${methodText}</em></p>
            <p><strong>Đã trả lời:</strong> ${questionsAnsweredCount}/5</p>
        `;
    }

    /**
     * Tải dữ liệu câu hỏi từ URL và lưu vào cache.
     * @returns {Promise<void>}
     */
    async function fetchQuestions() {
        log('Entering fetchQuestions function.');
        if (isFetchingQuestions) {
            log('Already fetching questions, skipping duplicate request.', 'warn');
            return;
        }
        isFetchingQuestions = true;

        const cachedData = localStorage.getItem('cachedQuestions');
        const cacheTime = localStorage.getItem('cacheTime');
        const now = Date.now();

        if (cachedData && cacheTime && (now - parseInt(cacheTime) < CACHE_DURATION)) {
            try {
                const parsedData = JSON.parse(cachedData);
                if (parsedData && typeof parsedData === 'object' && parsedData.questions && typeof parsedData.questions === 'object') {
                    questionDataCache = parsedData;
                    log('Using cached question data.');
                    isFetchingQuestions = false;
                    return;
                } else {
                    log('Cached data has invalid structure, re-fetching.', 'warn');
                }
            } catch (e) {
                log('Error parsing cached data, re-fetching: ' + e.message, 'error');
            }
        }

        log(`Attempting to fetch new question data from: ${QUESTION_DATA_URL}`);
        try {
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: QUESTION_DATA_URL,
                    onload: function(res) {
                        if (res.status === 200) {
                            resolve(res.responseText);
                        } else {
                            reject(new Error(`Failed to fetch questions: ${res.status} ${res.statusText}`));
                        }
                    },
                    onerror: function(err) {
                        reject(new Error('Network error or CORS issue: ' + err.statusText));
                    }
                });
            });

            const data = JSON.parse(response);

            if (!data || typeof data !== 'object' || !data.questions || typeof data.questions !== 'object') {
                log('Fetched data is not in the expected { "questions": { ... } } format.', 'error');
                throw new Error('Fetched data has invalid structure. Missing "questions" property or it\'s not an object.');
            }

            questionDataCache = data;
            localStorage.setItem('cachedQuestions', JSON.stringify(data));
            localStorage.setItem('cacheTime', now.toString());
            log('Successfully fetched and cached new question data.');
        } catch (error) {
            log('Failed to fetch or parse question data: ' + error.message, 'error');
            questionDataCache = null;
            updateAnswerOverlay('...', '...', `Lỗi tải dữ liệu: ${error.message}`, '');
        } finally {
            isFetchingQuestions = false;
            log('Exiting fetchQuestions function.');
        }
    }

    /**
     * Hàm chính xử lý logic vấn đáp.
     */
    function processQuizOrQuestionStep() {
        // Kiểm tra xem dữ liệu câu hỏi đã sẵn sàng chưa
        if (!questionDataCache || !questionDataCache.questions || Object.keys(questionDataCache.questions).length === 0) {
            log('Question data not available or invalid. Attempting to load/reload...', 'warn');
            updateAnswerOverlay('...', '...', 'Đang chờ dữ liệu...', '');
            if (!isFetchingQuestions) {
                fetchQuestions();
            }
            return;
        }

        const startButton = document.getElementById('start-quiz-button');
        if (startButton && window.getComputedStyle(startButton).display !== 'none') {
            log('Start button found and visible.');
            if (!quizStarted) {
                log('Quiz has not started yet. Clicking "BẮT ĐẦU VẤN ĐÁP" button.');
                startButton.click();
                updateAnswerOverlay('...', '...', 'Đã nhấn BẮT ĐẦU', '');
                quizStarted = true;
                questionsAnsweredCount = 0;
                lastQuestionText = ''; // Reset câu hỏi cuối cùng khi bắt đầu quiz mới
                // Đợi một chút để câu hỏi đầu tiên tải
                setTimeout(() => {
                    log('Delay after clicking start button complete. Proceeding to process first question.');
                    processQuestionAnswerLogic();
                }, DELAY_AFTER_START_CLICK);
                return;
            }
        } else {
            if (quizStarted) {
                processQuestionAnswerLogic();
            } else {
                updateAnswerOverlay('...', '...', 'Đang chờ Quiz bắt đầu', '');
            }
        }
    }

    /**
     * Xử lý logic tìm câu hỏi và trả lời.
     */
    function processQuestionAnswerLogic() {
        log(`Current questions answered: ${questionsAnsweredCount}/5`);

        if (questionsAnsweredCount >= 5) {
            log('Quiz completed (5/5 questions answered). Script will stop.', 'info');
            updateAnswerOverlay('Hoàn thành!', 'Thành công!', 'Đã xong 5/5 câu', '');
            clearInterval(mainIntervalId);
            return;
        }

        // --- Bổ sung kiểm tra sự hiện diện và nội dung của câu hỏi ---
        const questionElement = document.getElementById('question');
        const currentQuestionText = questionElement ? questionElement.innerText.trim() : '';

        // --- Kiểm tra câu hỏi mới đã xuất hiện chưa ---
        if (!questionElement || currentQuestionText === '' || currentQuestionText === lastQuestionText) {
            // Nếu câu hỏi chưa có, hoặc rỗng, hoặc vẫn là câu hỏi cũ, thì đợi
            log(`Waiting for a new question. Current: "${currentQuestionText}", Last: "${lastQuestionText}"`, 'warn');
            updateAnswerOverlay('...', '...', 'Đang chờ câu hỏi mới...', '');

            // Đặt timeout để tránh chờ vô hạn nếu có vấn đề
            if (!waitForNewQuestionTimeout) {
                waitForNewQuestionTimeout = setTimeout(() => {
                    log('Timeout: New question did not appear within ' + MAX_WAIT_FOR_NEW_QUESTION + 'ms.', 'error');
                    updateAnswerOverlay('Lỗi!', 'Không tải được câu hỏi mới', 'Dừng Script!', '');
                    clearInterval(mainIntervalId);
                }, MAX_WAIT_FOR_NEW_QUESTION);
            }
            return; // Thoát và đợi lần kiểm tra tiếp theo
        }

        // Nếu câu hỏi mới đã xuất hiện, xóa timeout chờ
        if (waitForNewQuestionTimeout) {
            clearTimeout(waitForNewQuestionTimeout);
            waitForNewQuestionTimeout = null;
        }
        log(`Extracted new question: "${currentQuestionText}"`);
        lastQuestionText = currentQuestionText; // Cập nhật câu hỏi cuối cùng đã thấy

        // --- Bổ sung kiểm tra sự hiện diện của các lựa chọn ---
        const optionElements = document.querySelectorAll('.options .option');
        if (optionElements.length === 0) {
            log('Option elements not found. Waiting for options to appear...', 'warn');
            updateAnswerOverlay(currentQuestionText, '...', 'Đang chờ lựa chọn...', '');
            return; // Thoát và đợi lần kiểm tra tiếp theo
        }

        // --- Bổ sung kiểm tra tiến trình (progress circles) ---
        const progressDiv = document.getElementById('progress');
        const progressCircles = document.querySelectorAll('#progress .progress-circle');
        if (!progressDiv || progressCircles.length === 0) {
            log('Progress indicators not found. Waiting for quiz to be in active question state...', 'warn');
            updateAnswerOverlay(currentQuestionText, '...', 'Đang chờ tiến trình...', '');
            return; // Thoát và đợi lần kiểm tra tiếp theo
        }

        const questionAnswers = questionDataCache.questions;
        let foundAnswer = null;
        let answerMethod = 'Không tìm thấy';

        // 1. Tìm kiếm chính xác
        if (questionAnswers[currentQuestionText]) {
            foundAnswer = questionAnswers[currentQuestionText];
            answerMethod = 'Chính xác';
            log(`Found exact match for question: "${currentQuestionText}" -> "${foundAnswer}"`);
        } else {
            // 2. Tìm kiếm tương đối (loại bỏ dấu câu, khoảng trắng thừa, chữ hoa/thường)
            const normalizedQuestion = currentQuestionText.toLowerCase()
                                            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');

            for (const storedQuestion in questionAnswers) {
                const normalizedStoredQuestion = storedQuestion.toLowerCase()
                                                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');
                if (normalizedStoredQuestion === normalizedQuestion) {
                    foundAnswer = questionAnswers[storedQuestion];
                    answerMethod = 'Tương đối (Chuẩn hóa)';
                    log(`Found fuzzy match for question (normalized): "${currentQuestionText}" -> "${foundAnswer}"`);
                    break;
                }
            }
        }

        updateAnswerOverlay(currentQuestionText, foundAnswer || 'Đang tìm...', foundAnswer ? 'Đã tìm thấy' : 'Đang chờ...', answerMethod);

        if (foundAnswer) {
            let clicked = false;
            for (let i = 0; i < optionElements.length; i++) {
                const optionText = optionElements[i].innerText.trim();
                if (optionText === foundAnswer) {
                    log(`Clicking correct answer: "${optionText}"`);
                    optionElements[i].click();
                    clicked = true;
                    questionsAnsweredCount++;
                    updateAnswerOverlay(currentQuestionText, foundAnswer, 'Đã trả lời!', answerMethod);
                    // Không cần setTimeout ở đây nữa, vì logic chờ câu hỏi mới sẽ xử lý
                    // việc này một cách tự nhiên ở lần gọi processQuestionAnswerLogic tiếp theo.
                    break;
                }
            }
            if (!clicked) {
                log(`Found answer "${foundAnswer}" in data but could not click it on page (option text mismatch or element not interactable).`, 'error');
                updateAnswerOverlay(currentQuestionText, foundAnswer, 'Lỗi click đáp án!', answerMethod);
            }
        } else {
            log(`No answer found for question: "${currentQuestionText}"`, 'warn');
            updateAnswerOverlay(currentQuestionText, 'Không có trong data', 'Chưa tìm thấy', answerMethod);
        }
    }

    // --- Khởi tạo Script ---
    function init() {
        log('Entering init function.');

        // Xóa bất kỳ interval cũ nào để tránh chạy trùng lặp nếu trang được tải lại
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            log('Main interval (ID: ' + mainIntervalId + ') cleared before re-initialization.');
        }

        // Thiết lập interval chính để liên tục kiểm tra và xử lý
        mainIntervalId = setInterval(processQuizOrQuestionStep, CHECK_INTERVAL);
        log(`Main interval (ID: ${mainIntervalId}) set up with interval of ${CHECK_INTERVAL}ms.`);

        // Tải dữ liệu câu hỏi trong nền ngay lập tức
        log('Initiating background fetch of question data.');
        fetchQuestions().then(() => {
            log('Question data successfully loaded in background.');
            // Sau khi dữ liệu được tải, gọi lần đầu để xử lý nút "BẮT ĐẦU" hoặc câu hỏi
            processQuizOrQuestionStep();
        }).catch(error => {
            log('Failed to load question data during initialization: ' + error.message, 'error');
            updateAnswerOverlay('Lỗi!', 'Không thể tải dữ liệu', 'Dừng Script!', '');
            clearInterval(mainIntervalId);
            mainIntervalId = null;
        });

        log('Exiting init function.');
    }

    // Chạy init khi DOM đã sẵn sàng hoặc tải lại trang
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
        log('Event listener for DOMContentLoaded attached.');
    } else {
        init();
        log('Immediately calling init as DOM is already ready.');
    }

    // Lắng nghe sự kiện tải lại trang hoặc điều hướng (Spa mode)
    window.addEventListener('load', () => {
        log('Event listener for window "load" attached.');
        init();
    });

})();
