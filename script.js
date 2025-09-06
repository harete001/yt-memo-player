document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const appContainer = document.querySelector('.app-container');
    const youtubeUrlInput = document.getElementById('youtube-url');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const addMemoButton = document.getElementById('add-memo');
    const loadVideoButton = document.getElementById('load-video');
    const pasteUrlButton = document.getElementById('paste-url');
    const quickMemoInput = document.getElementById('quick-memo-input');
    const addQuickMemoButton = document.getElementById('add-quick-memo');
    const prevFrameButton = document.getElementById('prev-frame');
    const nextFrameButton = document.getElementById('next-frame');
    const memoList = document.getElementById('memo-list');
    const playbackRateDisplay = document.getElementById('playback-rate-display');
    
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    const historyList = document.getElementById('history-list');
    const historySearchInput = document.getElementById('history-search');

    // --- State ---
    let player;
    let currentVideoId = null;
    let currentVideoTitle = '';
    let memos = []; // { id, time, text }
    let editingMemoId = null; // ID of the memo currently being edited
    let rateDisplayTimeout; // Timeout for hiding the playback rate display
    let videoHistory = JSON.parse(localStorage.getItem('yt-memo-history')) || [];
    const FRAME_RATE = 60; // 格闘ゲーム動画を想定し、60fpsを基準にする

    // --- YouTube Player Setup ---
    window.onYouTubeIframeAPIReady = () => {
        // This function is called by the YouTube API script.
        // We don't create a player here initially, but wait for a URL.
    };

    // --- Data Persistence ---
    function saveMemosToHistory() {
        if (!currentVideoId) return; // No video is loaded, nothing to save.
        const videoInHistory = videoHistory.find(item => item.id === currentVideoId);
        if (videoInHistory) {
            // Save a deep copy of the memos array
            videoInHistory.memos = JSON.parse(JSON.stringify(memos));
            localStorage.setItem('yt-memo-history', JSON.stringify(videoHistory));
        }
    }

    function loadVideoById(videoId) {
        // Save memos for the *previous* video before loading a new one.
        saveMemosToHistory();

        // Find and restore data for the new video
        const videoInHistory = videoHistory.find(item => item.id === videoId);
        memos = (videoInHistory && videoInHistory.memos) ? JSON.parse(JSON.stringify(videoInHistory.memos)) : [];
        editingMemoId = null;

        prevFrameButton.disabled = true;
        nextFrameButton.disabled = true;

        renderMemos(); // Render restored memos

        if (player) {
            // If a player exists, just load the new video and play it.
            player.loadVideoById(videoId);
        } else {
            // If no player, create a new one.
            player = new YT.Player('player', {
                height: '360',
                width: '640',
                videoId: videoId,
                playerVars: {
                    'playsinline': 1,
                    'autoplay': 1, // Autoplay as requested
                    'rel': 0 // Don't show related videos at the end
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
        }
    }

    function onPlayerReady(event) {
        // Enable UI elements now that the player is ready.
        event.target.playVideo(); // Ensure it plays
        updateVideoData(event.target);
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            updateVideoData(event.target);
        }
    }

    function updateVideoData(playerInstance) {
        currentVideoId = playerInstance.getVideoData().video_id;
        currentVideoTitle = playerInstance.getVideoData().title;
        
        addMemoButton.disabled = false;
        prevFrameButton.disabled = false;
        nextFrameButton.disabled = false;
        updateVideoHistory(currentVideoId, currentVideoTitle);
    }

    // --- URL Handling ---
    function extractVideoId(url) {
        // Regex to find the video ID from various YouTube URL formats
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    function handleUrlInput() {
        const url = youtubeUrlInput.value;
        const videoId = extractVideoId(url);
        if (videoId) {
            loadVideoById(videoId);
        } else {
            alert('有効なYouTube動画のURLではありません。');
        }
    }

    loadVideoButton.addEventListener('click', handleUrlInput);

    pasteUrlButton.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            youtubeUrlInput.value = text;
            handleUrlInput(); // URLを処理して動画を読み込む
        } catch (err) {
            console.error('クリップボードの読み取りに失敗しました: ', err);
            alert('クリップボードからの貼り付けに失敗しました。ブラウザの権限を確認してください。');
        }
    });

    youtubeUrlInput.addEventListener('paste', (event) => {
        // Use a short timeout to allow the input value to update before reading it
        setTimeout(handleUrlInput, 4);
    });

    youtubeUrlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleUrlInput();
        }
    });

    // --- Memo Functionality ---
    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    addMemoButton.addEventListener('click', () => {
        if (!player || typeof player.getCurrentTime !== 'function') {
            alert('動画が読み込まれていません。');
            return;
        }
        // 入力ソースをクイックメモ欄に一本化
        const text = quickMemoInput.value.trim(); // 空白のみの入力は空文字列として扱う
        const time = player.getCurrentTime();
        memos.push({ id: Date.now(), time, text });
        memos.sort((a, b) => a.time - b.time); // Keep memos sorted by time
        renderMemos();
        saveMemosToHistory(); // Save memos after adding a new one
        quickMemoInput.value = ''; // 入力欄をクリア
    });

    // Add memo with Enter key from the quick input
    quickMemoInput.addEventListener('keydown', (event) => {
        // Add memo on Enter, but allow Shift+Enter for new lines
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent adding a new line
            addMemoButton.click();
        }
    });

    // Handle click on the new quick-add button
    addQuickMemoButton.addEventListener('click', () => {
        addMemoButton.click(); // Trigger the main (hidden) add button's logic
    });

    // --- Frame-by-Frame Controls ---
    function seekByFrames(frameCount) {
        if (!player || typeof player.getCurrentTime !== 'function') return;

        player.pauseVideo(); // フレーム単位で移動するために一時停止する

        const currentTime = player.getCurrentTime();
        const newTime = currentTime + (frameCount / FRAME_RATE);
        player.seekTo(newTime, true);
    }

    prevFrameButton.addEventListener('click', () => {
        seekByFrames(-1);
    });
    nextFrameButton.addEventListener('click', () => {
        seekByFrames(1);
    });

    // --- Memo List Event Handling (Edit, Delete, Seek) ---
    memoList.addEventListener('click', (event) => {
        const target = event.target;
        const memoItem = target.closest('.memo-item');
        if (!memoItem) return;

        const memoId = Number(memoItem.dataset.id);

        // Action: Seek to timestamp
        const timestampEl = target.closest('.timestamp');
        if (timestampEl && player) {
            const time = parseFloat(timestampEl.dataset.time);
            player.seekTo(time, true);
            player.playVideo();
            return;
        }

        // Action: Enter Edit Mode (triggered by edit button or content click)
        const isEditTrigger = target.classList.contains('memo-item-edit-btn') || target.closest('.memo-content');
        if (isEditTrigger && editingMemoId !== memoId) {
            editingMemoId = memoId;
            renderMemos();
            // After re-rendering, focus the textarea
            const textarea = memoList.querySelector(`.memo-item[data-id='${memoId}'] .memo-edit-textarea`);
            if (textarea) {
                textarea.focus();
                // Move cursor to end
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
            return;
        }

        // Action: Save Memo
        if (target.classList.contains('save-button')) {
            const textarea = memoItem.querySelector('.memo-edit-textarea');
            const newText = textarea.value.trim(); // 空白のみの場合は空文字列として保存
            const memo = memos.find(m => m.id === memoId);
            if (memo) {
                memo.text = newText;
            }
            editingMemoId = null;
            renderMemos();
            saveMemosToHistory(); // Save memos after edit
            return;
        }

        // Action: Cancel Edit
        if (target.classList.contains('cancel-button')) {
            editingMemoId = null;
            renderMemos();
            return;
        }

        // Action: Delete Memo
        if (target.classList.contains('delete-button')) {
            // 削除前に確認ダイアログを表示
            if (confirm('このメモを削除しますか？この操作は元に戻せません。')) {
                memos = memos.filter(m => m.id !== memoId);
                editingMemoId = null; // 編集モードだった場合も解除
                renderMemos();
                saveMemosToHistory(); // 削除後に保存
            }
            return;
        }
    });

    // Handle Enter/Escape keys during memo editing
    memoList.addEventListener('keydown', (event) => {
        if (event.target.classList.contains('memo-edit-textarea')) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.target.closest('.memo-item').querySelector('.save-button').click();
            } else if (event.key === 'Escape') {
                event.target.closest('.memo-item').querySelector('.cancel-button').click();
            }
        }
    });

    function renderMemos() {
        memoList.innerHTML = '';
        memos.forEach(memo => {
            const li = document.createElement('li');
            li.className = 'memo-item';
            li.dataset.id = memo.id;

            // Sanitize text content to prevent XSS
            const sanitizedText = memo.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            if (memo.id === editingMemoId) {
                // --- EDIT MODE ---
                li.innerHTML = `
                    <div class="memo-header">
                        <h3 class="timestamp" data-time="${memo.time}">${formatTime(memo.time)}</h3>
                        <hr>
                    </div>
                    <div>
                        <textarea class="memo-edit-textarea">${memo.text}</textarea>
                        <div class="memo-edit-buttons">
                            <button class="cancel-button">キャンセル</button>
                            <button class="save-button">確定</button>
                        </div>
                    </div>
                `;
            } else {
                // --- NORMAL MODE ---
                li.innerHTML = `
                    <div class="memo-header">
                        <h3 class="timestamp" data-time="${memo.time}">${formatTime(memo.time)}</h3>
                        <div class="memo-item-actions">
                            <button class="memo-item-edit-btn" title="メモを編集">編集</button>
                            <button class="delete-button memo-item-delete-btn" title="メモを削除">削除</button>
                        </div>
                    </div>
                    <div class="memo-content">
                        <p>${sanitizedText}</p>
                    </div>
                `;
            }
            memoList.appendChild(li);
        });
    }

    // --- Page Navigation ---
    function switchPage(targetPageId) {
        pages.forEach(page => {
            page.classList.toggle('hidden', page.id !== targetPageId);
        });
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.page === targetPageId);
        });

        if (targetPageId === 'page-history') {
            renderHistory();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPageId = e.target.dataset.page;
            window.history.pushState(null, '', e.target.href);
            switchPage(targetPageId);
        });
    });

    // --- History ---
    function updateVideoHistory(videoId, videoTitle) {
        const existingIndex = videoHistory.findIndex(item => item.id === videoId);
        if (existingIndex > -1) {
            // Move to top
            const item = videoHistory.splice(existingIndex, 1)[0];
            item.lastPlayed = new Date().toISOString();
            videoHistory.unshift(item);
        } else {
            // Add new entry
            videoHistory.unshift({
                id: videoId,
                title: videoTitle,
                lastPlayed: new Date().toISOString()
            });
        }
        // Limit history size
        if (videoHistory.length > 100) {
            videoHistory.pop();
        }
        localStorage.setItem('yt-memo-history', JSON.stringify(videoHistory));
    }

    function renderHistory(filter = '') {
        historyList.innerHTML = '';
        const filteredHistory = videoHistory.filter(item => 
            item.title.toLowerCase().includes(filter.toLowerCase())
        );

        if (filteredHistory.length === 0) {
            historyList.innerHTML = '<li class="no-history">再生履歴はありません。</li>';
            return;
        }

        filteredHistory.forEach(item => {
            const li = document.createElement('li');
            const videoUrl = `#video`;
            const lastPlayedDate = new Date(item.lastPlayed).toLocaleString('ja-JP');
            const memoCount = (item.memos && Array.isArray(item.memos)) ? item.memos.length : 0;
            
            li.innerHTML = `
                <div class="history-col-title"><a href="${videoUrl}" data-video-id="${item.id}">${item.title}</a></div>
                <div class="history-col-memos">${memoCount}</div>
                <div class="history-col-date">${lastPlayedDate}</div>
                <div class="history-col-actions">
                    <button class="history-delete-btn" data-video-id="${item.id}">削除</button>
                </div>
            `;
            historyList.appendChild(li);
        });
    }

    historySearchInput.addEventListener('input', (e) => {
        renderHistory(e.target.value);
    });

    historyList.addEventListener('click', (e) => {
        // Use event delegation to check which element was clicked
        const deleteBtn = e.target.closest('.history-delete-btn');
        const link = e.target.closest('a[data-video-id]');

        if (deleteBtn) {
            e.preventDefault();
            const videoId = deleteBtn.dataset.videoId;
            
            // Find the video title for a more user-friendly confirmation message
            const videoToDelete = videoHistory.find(item => item.id === videoId);
            const videoTitle = videoToDelete ? videoToDelete.title : 'この項目';

            if (confirm(`「${videoTitle}」を履歴から削除しますか？この操作は元に戻せません。`)) {
                // Filter out the item to be deleted from the main history array
                videoHistory = videoHistory.filter(item => item.id !== videoId);
                
                // Persist the change to localStorage
                localStorage.setItem('yt-memo-history', JSON.stringify(videoHistory));
                
                // Re-render the history list to reflect the deletion
                // Pass the current search term to maintain the filtered view
                renderHistory(historySearchInput.value);
            }
        } else if (link) {
            e.preventDefault();
            const videoId = link.dataset.videoId;
            switchPage('page-video');
            youtubeUrlInput.value = `https://www.youtube.com/watch?v=${videoId}`;
            loadVideoById(videoId);
        }
    });

    // --- Settings Page ---
    const settingsNavLinks = document.querySelectorAll('.settings-nav-link');
    const settingsSubPages = document.querySelectorAll('.settings-subpage');
    const exportButton = document.getElementById('export-button');
    const importButton = document.getElementById('import-button');
    const importFileInput = document.getElementById('import-file-input');

    function switchSettingsSubPage(targetSubPageId) {
        settingsSubPages.forEach(page => {
            page.classList.toggle('hidden', page.id !== targetSubPageId);
        });
        settingsNavLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.subpage === targetSubPageId);
        });
    }

    settingsNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSubPageId = e.target.dataset.subpage;
            switchSettingsSubPage(targetSubPageId);
        });
    });

    // --- Theme Management ---
    const themeRadios = document.querySelectorAll('input[name="theme"]');

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }

    function saveTheme(theme) {
        localStorage.setItem('yt-memo-theme', theme);
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem('yt-memo-theme') || 'light';
        applyTheme(savedTheme);
        const currentRadio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
        if (currentRadio) {
            currentRadio.checked = true;
        }
    }

    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedTheme = e.target.value;
            applyTheme(selectedTheme);
            saveTheme(selectedTheme);
        });
    });

    // --- Import/Export Logic ---
    const APP_ID = 'yt-memo-app';
    const APP_VERSION = '1.0';

    exportButton.addEventListener('click', () => {
        const historyData = localStorage.getItem('yt-memo-history');
        
        if (!historyData || JSON.parse(historyData).length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }

        const exportData = {
            appId: APP_ID,
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            data: JSON.parse(historyData)
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
        a.download = `yt-memo-backup-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    importButton.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                if (importedData.appId !== APP_ID || !importedData.data) {
                    alert('無効なファイル形式です。');
                    return;
                }

                if (!confirm('現在の履歴とメモがすべて上書きされます。よろしいですか？')) {
                    importFileInput.value = ''; // Reset input
                    return;
                }

                localStorage.setItem('yt-memo-history', JSON.stringify(importedData.data));
                
                alert('データが正常にインポートされました。ページをリロードします。');
                location.reload();

            } catch (error) {
                alert('ファイルの読み込み中にエラーが発生しました。');
                console.error('Import error:', error);
            } finally {
                importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    });

    // --- Sidebar Collapse Logic ---
    function applySidebarState(isCollapsed) {
        appContainer.classList.toggle('sidebar-collapsed', isCollapsed);
        // ボタンのアイコンとツールチップを状態に応じて変更
        if (isCollapsed) {
            toggleSidebarBtn.innerHTML = '»';
            toggleSidebarBtn.setAttribute('title', 'サイドバーを展開');
        } else {
            toggleSidebarBtn.innerHTML = '«';
            toggleSidebarBtn.setAttribute('title', 'サイドバーを折りたたむ');
        }
    }

    function saveSidebarState(isCollapsed) {
        localStorage.setItem('yt-memo-sidebar-collapsed', isCollapsed);
    }

    function loadSidebarState() {
        const isCollapsed = localStorage.getItem('yt-memo-sidebar-collapsed') === 'true';
        applySidebarState(isCollapsed);
    }

    toggleSidebarBtn.addEventListener('click', () => {
        const isCurrentlyCollapsed = appContainer.classList.contains('sidebar-collapsed');
        applySidebarState(!isCurrentlyCollapsed);
        saveSidebarState(!isCurrentlyCollapsed);
    });

    // --- Initial Load ---
    function handleInitialLoad() {
        loadTheme();
        loadSidebarState();
        const hash = window.location.hash;
        if (hash.startsWith('#history')) {
            switchPage('page-history');
        } else if (hash.startsWith('#settings')) {
            switchPage('page-settings');
        } else {
            switchPage('page-video');
        }
    }

    handleInitialLoad();

    // Save memos when the user is about to leave the page
    window.addEventListener('beforeunload', saveMemosToHistory);

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (event) => {
        // Ignore shortcuts if a text input is focused
        const activeElement = document.activeElement;
        const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';

        if (isInputFocused) {
            return;
        }

        // --- Space key: Play/Pause ---
        if (event.code === 'Space') {
            event.preventDefault(); // Prevent page scroll
            if (player && typeof player.getPlayerState === 'function') {
                const playerState = player.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    player.pauseVideo();
                } else {
                    player.playVideo();
                }
            }
        }

        // --- Arrow keys & WASD: Seek ---
        if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
            event.preventDefault(); // Prevent default browser action
            if (player && typeof player.getCurrentTime === 'function') {
                const currentTime = player.getCurrentTime();
                const seekAmount = event.ctrlKey ? 5 : 1; // 5 seconds with Ctrl, 1 second otherwise
                const isForward = event.code === 'ArrowRight' || event.code === 'KeyD';
                const newTime = isForward ? currentTime + seekAmount : currentTime - seekAmount;
                player.seekTo(newTime, true);
            }
        }

        // --- Arrow keys & WASD: Playback Rate ---
        if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
            event.preventDefault(); // Prevent page scroll
            if (player && typeof player.getPlaybackRate === 'function') {
                const availableRates = player.getAvailablePlaybackRates();
                const currentRate = player.getPlaybackRate();
                const currentIndex = availableRates.indexOf(currentRate);
                const isSpeedUp = event.code === 'ArrowUp' || event.code === 'KeyW';
                let newRate = null;

                if (isSpeedUp && currentIndex < availableRates.length - 1) {
                    newRate = availableRates[currentIndex + 1];
                } else if (!isSpeedUp && currentIndex > 0) { // Speed down
                    newRate = availableRates[currentIndex - 1];
                }

                if (newRate !== null) {
                    player.setPlaybackRate(newRate);
                    showPlayerFeedback(`${newRate}x`);
                }
            }
        }

        // --- Number keys (1-9): Jump to percentage ---
        const key = event.code;
        // 'Digit1'-'Digit9' or 'Numpad1'-'Numpad9'
        if ((key.startsWith('Digit') || key.startsWith('Numpad')) && key.slice(-1) !== '0') {
            const number = parseInt(key.slice(-1), 10);

            if (!isNaN(number) && number >= 1 && number <= 9) {
                event.preventDefault();
                if (player && typeof player.getDuration === 'function') {
                    const duration = player.getDuration();
                    if (duration > 0) { // Ensure duration is available
                        const newTime = (duration * number) / 10;
                        player.seekTo(newTime, true);
                        showPlayerFeedback(`${number * 10}%`);
                    }
                }
            }
        }

        // --- 'M' key: Add Quick Memo ---
        if (event.code === 'KeyM') {
            event.preventDefault();
            // Trigger the same action as clicking the "メモを追加" button
            addQuickMemoButton.click();
        }
    });

    // --- UI Feedback Functions ---
    function showPlayerFeedback(text, duration = 1200) {
        // Clear any existing timeout to reset the timer
        clearTimeout(rateDisplayTimeout);

        // Update text and show the element
        playbackRateDisplay.textContent = text;
        playbackRateDisplay.classList.add('show');

        // Set a timeout to hide the element after a short duration
        rateDisplayTimeout = setTimeout(() => {
            playbackRateDisplay.classList.remove('show');
        }, duration);
    }
});