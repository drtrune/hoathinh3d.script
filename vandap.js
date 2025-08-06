// ==UserScript==
// @name         HH3D Vấn đáp
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Tự động giải Vấn Đáp Tổng Môn trên Hoathinh3d
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/van-dap-tong-mon*
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
    const CHECK_INTERVAL_MAIN = 500; // Kiểm tra chính mỗi 0.5 giây
    const DELAY_AFTER_START_CLICK = 1500; // Thời gian chờ sau khi click BẮT ĐẦU VẤN ĐÁP
    const WAIT_FOR_NEXT_QUESTION_INTERVAL = 1000; // Kiểm tra câu hỏi mới mỗi 1 giây (được dùng trong setTimeout)
    const MAX_WAIT_FOR_NEXT_QUESTION_ATTEMPTS = 10; // Tối đa 10 lần kiểm tra (tổng 10 giây)
    const DELAY_AFTER_ANSWER_CLICK_SUCCESS = 750; // Thời gian chờ sau khi click đáp án thành công
    const DELAY_AFTER_ANSWER_CLICK_FAIL = 2000; // Thời gian chờ sau khi click đáp án thất bại (để thử lại)


    // --- Biến Trạng Thái ---
    let questionDataCache = null;
    let quizStarted = false;
    let questionsAnsweredCount = 0; // Sẽ được tính lại dựa trên UI
    let mainIntervalId = null;
    let questionProcessingIntervalId = null;
    let isFetchingQuestions = false;
    let lastQuestionText = '';
    let currentWaitAttempts = 0;
    let isWaitingForNextQuestion = false;

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
                top: '110px',
                left: '10px',
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

        // Đếm số câu hỏi đã trả lời thành công dựa trên UI
        const correctCircles = document.querySelectorAll('#progress .progress-circle.correct');
        const currentAnsweredCount = correctCircles ? correctCircles.length : 0;

        overlay.innerHTML = `
            <p><strong>Trạng thái:</strong> <span style="color: yellow;">${statusText}</span></p>
            <p><strong>Câu hỏi:</strong> <span style="color: lightblue;">${questionText}</span></p>
            <p><strong>Đáp án:</strong> <span style="color: lightgreen;">${answerText}</span></p>
            <p><strong>Độ chính xác:</strong> <em>${methodText}</em></p>
            <p><strong>Đã trả lời:</strong> ${currentAnsweredCount}/5</p>
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
            const responseText = await new Promise((resolve, reject) => {
                // Ưu tiên sử dụng GM_xmlhttpRequest nếu script được chạy bởi Tampermonkey với quyền tương ứng
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: QUESTION_DATA_URL,
                        onload: function(res) {
                            if (res.status === 200) {
                                resolve(res.responseText);
                            } else {
                                reject(new Error(`Failed to fetch questions via GM_xmlhttpRequest: ${res.status} ${res.statusText}`));
                            }
                        },
                        onerror: function(err) {
                            reject(new Error('GM_xmlhttpRequest network error or CORS issue: ' + err.statusText));
                        }
                    });
                } else {
                    // Fallback sang fetch API tiêu chuẩn nếu không có GM_xmlhttpRequest (khi script bị inject)
                    fetch(QUESTION_DATA_URL)
                        .then(res => {
                            if (res.ok) {
                                return res.text();
                            } else {
                                throw new Error(`Failed to fetch questions via standard fetch: ${res.status} ${res.statusText}`);
                            }
                        })
                        .then(resolve)
                        .catch(err => {
                            reject(new Error('Standard fetch network error or CORS issue: ' + err.message));
                        });
                }
            });

            const data = JSON.parse(responseText); // Sử dụng responseText đã nhận được

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
     * Bắt đầu hoặc tiếp tục quá trình xử lý câu hỏi/đáp án.
     */
    function startQuestionProcessing() {
        if (questionProcessingIntervalId) {
            clearInterval(questionProcessingIntervalId);
            log('Cleared existing question processing interval (ID: ' + questionProcessingIntervalId + ').');
        }
        log('Starting question processing interval.');
        isWaitingForNextQuestion = false; // Reset cờ chờ khi bắt đầu xử lý
        currentWaitAttempts = 0; // Reset số lần chờ
        questionProcessingIntervalId = setInterval(processQuestionAnswerLogic, CHECK_INTERVAL_MAIN);
    }

    /**
     * Hàm chính xử lý logic vấn đáp.
     * Chịu trách nhiệm kiểm tra nút bắt đầu quiz.
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
                questionsAnsweredCount = 0; // Sẽ được tính lại dựa trên UI
                lastQuestionText = ''; // Reset câu hỏi cuối cùng khi bắt đầu quiz mới

                // Dừng main interval vì nhiệm vụ của nó đã hoàn thành (click nút START)
                if (mainIntervalId) {
                    clearInterval(mainIntervalId);
                    mainIntervalId = null; // Đặt về null để biết nó đã dừng
                    log('Main interval stopped after clicking start button.');
                }

                // Chờ một chút rồi bắt đầu xử lý câu hỏi đầu tiên
                setTimeout(() => {
                    log('Delay after clicking start button complete. Starting initial question processing.');
                    startQuestionProcessing(); // Bắt đầu interval xử lý câu hỏi riêng
                }, DELAY_AFTER_START_CLICK);
            }
        } else {
            // Nếu nút start không còn hiển thị và quiz chưa bắt đầu, có thể nó đã chuyển sang màn hình khác
            if (!quizStarted) {
                updateAnswerOverlay('...', '...', 'Đang chờ Quiz bắt đầu (nút ẩn)', '');
            }
            // Nếu quizStarted là true, logic đã được chuyển sang questionProcessingIntervalId,
            // mainIntervalId sẽ không chạy nữa.
        }
    }

    /**
     * Hàm kiểm tra và xử lý câu hỏi mới.
     * Hàm này được gọi định kỳ bởi questionProcessingIntervalId.
     */
    function processQuestionAnswerLogic() {
        if (isWaitingForNextQuestion) {
            // log('Already in waiting state for next question. Skipping this interval.');
            return; // Nếu đang trong trạng thái chờ, không làm gì cả ở lần gọi này
        }

        // Lấy số câu hỏi đã trả lời thành công dựa trên UI
        const correctCircles = document.querySelectorAll('#progress .progress-circle.correct');
        questionsAnsweredCount = correctCircles ? correctCircles.length : 0;

        // --- Kiểm tra trạng thái kết thúc Quiz ---
        if (questionsAnsweredCount >= 5) {
            log('Quiz completed (5/5 questions answered based on UI). Script will stop.', 'info');
            updateAnswerOverlay('Hoàn thành!', 'Thành công!', 'Đã xong 5/5 câu', '');
            if (questionProcessingIntervalId) {
                clearInterval(questionProcessingIntervalId);
                questionProcessingIntervalId = null;
            }
            return;
        }

        // --- Lấy thông tin câu hỏi và lựa chọn hiện tại ---
        const questionElement = document.getElementById('question');
        const currentQuestionText = questionElement ? questionElement.innerText.trim() : '';
        const optionElements = document.querySelectorAll('.options .option');
        const progressDiv = document.getElementById('progress');
        const progressCircles = document.querySelectorAll('#progress .progress-circle'); // Tất cả các circle, không chỉ correct

        // Điều kiện để coi là "chưa sẵn sàng" hoặc "chưa phải câu hỏi mới":
        // 1. Không tìm thấy thẻ câu hỏi, HOẶC nội dung câu hỏi rỗng.
        // 2. KHÔNG tìm thấy các lựa chọn đáp án.
        // 3. KHÔNG tìm thấy thanh tiến trình (hoặc thanh tiến trình rỗng).
        // 4. Nội dung câu hỏi hiện tại vẫn giống hệt câu hỏi trước (chỉ check khi số câu trả lời trên UI chưa tăng).
        const isQuestionNotReadyOrSame =
            !questionElement || currentQuestionText === '' ||
            optionElements.length === 0 ||
            !progressDiv || progressCircles.length === 0 ||
            (questionsAnsweredCount === correctCircles.length && currentQuestionText === lastQuestionText); // Sửa điều kiện này

        if (isQuestionNotReadyOrSame) {
            // Nếu chưa sẵn sàng hoặc vẫn là câu hỏi cũ, bắt đầu hoặc tiếp tục chờ
            if (currentWaitAttempts < MAX_WAIT_FOR_NEXT_QUESTION_ATTEMPTS) {
                currentWaitAttempts++;
                log(`Waiting for new question and options (Attempt ${currentWaitAttempts}/${MAX_WAIT_FOR_NEXT_QUESTION_ATTEMPTS}). Current Q: "${currentQuestionText}", Last Q: "${lastQuestionText}", Correct circles: ${correctCircles.length}`, 'warn');
                updateAnswerOverlay(currentQuestionText || '...', '...', `Đang chờ câu hỏi mới (${currentWaitAttempts}/${MAX_WAIT_FOR_NEXT_QUESTION_ATTEMPTS})...`, '');

                isWaitingForNextQuestion = true; // Đặt cờ chờ

                // Dừng interval hiện tại để kiểm soát chính xác thời gian chờ 1 giây
                if (questionProcessingIntervalId) {
                    clearInterval(questionProcessingIntervalId);
                    questionProcessingIntervalId = null;
                }
                setTimeout(() => {
                    isWaitingForNextQuestion = false; // Bỏ cờ chờ
                    startQuestionProcessing(); // Khởi động lại interval xử lý câu hỏi
                }, WAIT_FOR_NEXT_QUESTION_INTERVAL);
                return; // Thoát khỏi hàm hiện tại
            } else {
                log('Timeout: New question or options did not appear within ' + MAX_WAIT_FOR_NEXT_QUESTION_ATTEMPTS + ' seconds. Stopping script.', 'error');
                updateAnswerOverlay('Lỗi!', 'Không tải được câu hỏi mới', 'Dừng Script!', '');
                if (questionProcessingIntervalId) {
                    clearInterval(questionProcessingIntervalId);
                    questionProcessingIntervalId = null;
                }
                return;
            }
        }

        // Nếu đã đến đây, nghĩa là câu hỏi mới đã xuất hiện và sẵn sàng
        currentWaitAttempts = 0; // Reset bộ đếm chờ
        isWaitingForNextQuestion = false; // Đảm bảo cờ chờ được tắt
        // lastQuestionText sẽ được cập nhật SAU KHI câu trả lời được click thành công và UI cập nhật
        log(`Processing question: "${currentQuestionText}" (Questions answered via UI: ${questionsAnsweredCount}/5)`);

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
            let targetOptionElement = null;

            for (let i = 0; i < optionElements.length; i++) {
                const optionTextOnPage = optionElements[i].textContent.trim();

                // So sánh chính xác hoặc so sánh đã chuẩn hóa tùy trường hợp
                const isMatch = (optionTextOnPage === foundAnswer) ||
                                (optionTextOnPage.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '') === foundAnswer.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, ''));

                if (isMatch) {
                    targetOptionElement = optionElements[i];
                    log(`Identified potential correct answer element: "${optionTextOnPage}"`);
                    break;
                }
            }

            if (targetOptionElement) {
                try {
                    // Cố gắng click vào phần tử
                    targetOptionElement.click();
                    log(`Attempted to click answer: "${targetOptionElement.textContent.trim()}"`);

                    // KHÔNG tăng questionsAnsweredCount ở đây, mà sẽ để nó tự cập nhật từ UI

                    // Cập nhật lastQuestionText sau khi click, để logic chờ câu hỏi mới có thể hoạt động
                    lastQuestionText = currentQuestionText;
                    updateAnswerOverlay(currentQuestionText, foundAnswer, 'Đã click đáp án!', answerMethod);

                    // Dừng interval hiện tại sau khi click thành công (hoặc cố gắng click)
                    if (questionProcessingIntervalId) {
                        clearInterval(questionProcessingIntervalId);
                        questionProcessingIntervalId = null;
                        log('Question processing interval stopped after attempting to answer.');
                    }
                    // Bắt đầu lại quá trình xử lý sau một khoảng trễ ngắn để trang web kịp phản hồi
                    // Logic sẽ tự chờ cho đến khi số correct circles tăng lên hoặc câu hỏi mới xuất hiện
                    setTimeout(() => {
                        log('Short delay after attempting to answer complete. Resuming question processing logic to check UI updates.');
                        startQuestionProcessing();
                    }, DELAY_AFTER_ANSWER_CLICK_SUCCESS);

                } catch (e) {
                    log(`Error clicking answer "${foundAnswer}": ${e.message}. Retrying...`, 'error');
                    updateAnswerOverlay(currentQuestionText, foundAnswer, 'Lỗi click đáp án!', answerMethod);
                    // Nếu click lỗi, dừng interval và thử lại sau một khoảng trễ lớn hơn
                    if (questionProcessingIntervalId) {
                        clearInterval(questionProcessingIntervalId);
                        questionProcessingIntervalId = null;
                    }
                    setTimeout(() => {
                        log('Longer delay after failed answer click. Retrying question processing logic.');
                        startQuestionProcessing();
                    }, DELAY_AFTER_ANSWER_CLICK_FAIL);
                }
            } else {
                log(`Found answer "${foundAnswer}" in data but could not find a matching clickable option element on page.`, 'error');
                updateAnswerOverlay(currentQuestionText, foundAnswer, 'Lỗi: Không tìm thấy đáp án trên trang!', answerMethod);
                // Nếu không tìm thấy phần tử để click, cũng dừng interval và thử lại
                if (questionProcessingIntervalId) {
                    clearInterval(questionProcessingIntervalId);
                    questionProcessingIntervalId = null;
                }
                setTimeout(() => {
                    log('Longer delay after no matching option element found. Retrying question processing logic.');
                    startQuestionProcessing();
                }, DELAY_AFTER_ANSWER_CLICK_FAIL);
            }
        } else {
            log(`No answer found for question: "${currentQuestionText}"`, 'warn');
            updateAnswerOverlay(currentQuestionText, 'Không có trong data', 'Chưa tìm thấy', answerMethod);

            // Nếu không tìm thấy đáp án và muốn click ngẫu nhiên để tiếp tục
            // if (optionElements.length > 0) {
            //      const randomIndex = Math.floor(Math.random() * optionElements.length);
            //      log(`Clicking random answer as no match found: ${optionElements[randomIndex].textContent.trim()}`);
            //      optionElements[randomIndex].click();
            //      lastQuestionText = currentQuestionText; // Cập nhật để kích hoạt chờ câu hỏi mới
            //      updateAnswerOverlay(currentQuestionText, optionElements[randomIndex].textContent.trim(), 'Trả lời ngẫu nhiên', 'Ngẫu nhiên');
            //      if (questionProcessingIntervalId) {
            //          clearInterval(questionProcessingIntervalId);
            //          questionProcessingIntervalId = null;
            //      }
            //      setTimeout(() => {
            //          log('Short delay after random answer click. Resuming question processing logic.');
            //          startQuestionProcessing();
            //      }, DELAY_AFTER_ANSWER_CLICK_SUCCESS);
            // } else {
            //      log('No answer found and no options to click randomly. Stopping script.', 'error');
            //      updateAnswerOverlay('Lỗi!', 'Không tìm thấy đáp án và lựa chọn', 'Dừng Script!', '');
            //      if (questionProcessingIntervalId) {
            //          clearInterval(questionProcessingIntervalId);
            //          questionProcessingIntervalId = null;
            //      }
            // }
        }
    }

    // --- Khởi tạo Script ---
    function init() {
        log('Entering init function.');

        // Xóa bất kỳ interval cũ nào để tránh chạy trùng lặp nếu trang được tải lại
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
            log('Main interval (ID: ' + mainIntervalId + ') cleared before re-initialization.');
        }
        if (questionProcessingIntervalId) {
            clearInterval(questionProcessingIntervalId);
            questionProcessingIntervalId = null;
            log('Question processing interval (ID: ' + questionProcessingIntervalId + ') cleared before re-initialization.');
        }

        // Reset trạng thái quiz khi khởi tạo
        quizStarted = false;
        questionsAnsweredCount = 0; // Sẽ được tính lại dựa trên UI
        lastQuestionText = '';
        currentWaitAttempts = 0;
        isWaitingForNextQuestion = false;

        // Thiết lập interval chính để liên tục kiểm tra nút START
        mainIntervalId = setInterval(processQuizOrQuestionStep, CHECK_INTERVAL_MAIN);
        log(`Main interval (ID: ${mainIntervalId}) set up with interval of ${CHECK_INTERVAL_MAIN}ms.`);

        // Tải dữ liệu câu hỏi trong nền ngay lập tức
        log('Initiating background fetch of question data.');
        fetchQuestions().then(() => {
            log('Question data successfully loaded in background.');
            // Gọi lần đầu processQuizOrQuestionStep để kiểm tra nút "BẮT ĐẦU"
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
    // Đảm bảo script khởi động lại nếu trang được tải lại hoàn toàn
    window.addEventListener('load', () => {
        log('Event listener for window "load" attached.');
        // Clear existing intervals to prevent duplicate runs
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
        }
        if (questionProcessingIntervalId) {
            clearInterval(questionProcessingIntervalId);
            questionProcessingIntervalId = null;
        }
        init();
    });

})();
