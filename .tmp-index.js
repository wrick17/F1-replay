(() => {
"use strict";
var __webpack_modules__ = ({
"./src/index.css"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
// extracted by css-extract-rspack-plugin

    if(true) {
      (function() {
        var localsJsonString = undefined;
        // 1770546631401
        var cssReload = (__webpack_require__("./node_modules/@rspack/core/dist/cssExtractHmr.js")/* .cssReload */.cssReload)(module.id, {});
        // only invalidate when locals change
        if (
          module.hot.data &&
          module.hot.data.value &&
          module.hot.data.value !== localsJsonString
        ) {
          module.hot.invalidate();
        } else {
          module.hot.accept();
        }
        module.hot.dispose(function(data) {
          data.value = localsJsonString;
          cssReload();
        });
      })();
    }
  

},
"./src/index.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var _tanstack_react_router__rspack_import_5 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/router.js");
/* import */ var _tanstack_react_router__rspack_import_6 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/RouterProvider.js");
/* import */ var react__rspack_import_1 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_1_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_1);
/* import */ var react_dom_client__rspack_import_2 = __webpack_require__("./node_modules/react-dom/client.js");
/* import */ var _routes_routeTree__rspack_import_3 = __webpack_require__("./src/routes/routeTree.ts");
/* import */ var _index_css__rspack_import_4 = __webpack_require__("./src/index.css");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");






const router = (0,_tanstack_react_router__rspack_import_5.createRouter)({
    routeTree: _routes_routeTree__rspack_import_3.routeTree
});
const container = document.getElementById("root");
if (!container) {
    throw new Error("Root element not found");
}
(0,react_dom_client__rspack_import_2.createRoot)(container).render(/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)((react__rspack_import_1_default().StrictMode), {
    children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_tanstack_react_router__rspack_import_6.RouterProvider, {
        router: router
    }, void 0, false, {
        fileName: "/Users/wrick/Projects/f1/src/index.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, undefined)
}, void 0, false, {
    fileName: "/Users/wrick/Projects/f1/src/index.tsx",
    lineNumber: 22,
    columnNumber: 3
}, undefined));

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/api/cache.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  getPersisted: () => (getPersisted),
  inFlight: () => (inFlight),
  responseCache: () => (responseCache),
  setPersisted: () => (setPersisted)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const responseCache = new Map();
const inFlight = new Map();
const IDB_NAME = "openf1-cache";
const IDB_STORE = "responses";
let idbPromise = null;
const getDb = ()=>{
    if (idbPromise) {
        return idbPromise;
    }
    if (typeof indexedDB === "undefined") {
        return Promise.reject(new Error("IndexedDB unavailable"));
    }
    idbPromise = new Promise((resolve, reject)=>{
        const request = indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = ()=>{
            const db = request.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        request.onerror = ()=>reject(request.error);
        request.onsuccess = ()=>resolve(request.result);
    });
    return idbPromise;
};
const getPersisted = async (key)=>{
    const db = await getDb();
    return new Promise((resolve, reject)=>{
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const request = store.get(key);
        request.onsuccess = ()=>resolve(request.result ?? null);
        request.onerror = ()=>reject(request.error);
    });
};
const setPersisted = async (key, value)=>{
    const db = await getDb();
    return new Promise((resolve, reject)=>{
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        const request = store.put(value, key);
        request.onsuccess = ()=>resolve();
        request.onerror = ()=>reject(request.error);
    });
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/api/openf1.client.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  buildQuery: () => (buildQuery),
  fetchChunked: () => (fetchChunked),
  fetchOpenF1: () => (fetchOpenF1),
  fetchReplayFromWorker: () => (fetchReplayFromWorker),
  uploadReplayToWorker: () => (uploadReplayToWorker)
});
/* import */ var _cache__rspack_import_0 = __webpack_require__("./src/modules/replay/api/cache.ts");
/* import */ var _rateLimiter__rspack_import_1 = __webpack_require__("./src/modules/replay/api/rateLimiter.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const API_BASE_URL = "https://api.openf1.org/v1";
const WORKER_BASE_URL = "http://localhost:8787" ?? 0 ?? 0;
const buildQuery = (params)=>{
    const entries = Object.entries(params).filter((param)=>{
        let [, value] = param;
        return value !== undefined && value !== null;
    });
    if (!entries.length) {
        return "";
    }
    const query = entries.map((param)=>{
        let [key, value] = param;
        const encodedValue = encodeURIComponent(String(value));
        if (key.includes(">") || key.includes("<")) {
            return `${key}${encodedValue}`;
        }
        return `${key}=${encodedValue}`;
    }).join("&");
    return `?${query}`;
};
const fetchOpenF1 = function(path, params, signal) {
    let cacheMode = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : "no-store";
    const key = `${path}${buildQuery(params)}`;
    if (cacheMode !== "no-store") {
        if (_cache__rspack_import_0.responseCache.has(key)) {
            return Promise.resolve(_cache__rspack_import_0.responseCache.get(key));
        }
        const existing = _cache__rspack_import_0.inFlight.get(key);
        if (existing) {
            return existing;
        }
    }
    const request = (async ()=>{
        if (cacheMode === "persist") {
            const persisted = await getPersisted(key).catch(()=>null);
            if (persisted) {
                _cache__rspack_import_0.responseCache.set(key, persisted);
                return persisted;
            }
        }
        let attempt = 0;
        while(attempt < 3){
            await (0,_rateLimiter__rspack_import_1.rateLimit)();
            const response = await fetch(`${API_BASE_URL}/${key}`, {
                signal
            });
            if (!response.ok) {
                if (response.status === 429 && attempt < 2) {
                    const retryAfter = Number(response.headers.get("retry-after"));
                    const waitMs = Number.isNaN(retryAfter) ? 1000 * (attempt + 1) : retryAfter * 1000;
                    await sleep(waitMs);
                    attempt += 1;
                    continue;
                }
                throw new Error(`OpenF1 request failed: ${response.status}`);
            }
            const payload = await response.json();
            if (cacheMode !== "no-store") {
                _cache__rspack_import_0.responseCache.set(key, payload);
            }
            if (cacheMode === "persist") {
                await (0,_cache__rspack_import_0.setPersisted)(key, payload).catch(()=>undefined);
            }
            return payload;
        }
        throw new Error("OpenF1 request failed after retries");
    })().finally(()=>{
        _cache__rspack_import_0.inFlight["delete"](key);
    });
    if (cacheMode !== "no-store") {
        _cache__rspack_import_0.inFlight.set(key, request);
    }
    return request;
};
const fetchChunked = async function(path, params, startMs, endMs, windowMs, onChunk, signal) {
    let cacheMode = arguments.length > 7 && arguments[7] !== void 0 ? arguments[7] : "no-store";
    const results = [];
    let cursor = startMs;
    while(cursor < endMs){
        const chunkEnd = Math.min(cursor + windowMs, endMs);
        const chunkParams = {
            ...params,
            "date>=": new Date(cursor).toISOString(),
            "date<=": new Date(chunkEnd).toISOString()
        };
        const chunk = await fetchOpenF1(path, chunkParams, signal, cacheMode);
        if (chunk.length) {
            results.push(...chunk);
        }
        onChunk === null || onChunk === void 0 ? void 0 : onChunk(chunk, chunkEnd);
        cursor = chunkEnd;
    }
    return results;
};
const fetchReplayFromWorker = async (sessionKey, signal)=>{
    const url = `${WORKER_BASE_URL}/replay${buildQuery({
        session_key: sessionKey
    })}`;
    const response = await fetch(url, {
        signal
    });
    if (response.status === 200) {
        const payload = await response.json();
        return {
            status: "hit",
            payload
        };
    }
    if (response.status === 202) {
        const data = await response.json();
        return {
            status: "miss",
            uploadToken: data.uploadToken,
            expiresAt: data.expiresAt
        };
    }
    throw new Error(`Replay cache request failed: ${response.status}`);
};
const uploadReplayToWorker = async (sessionKey, payload, uploadToken, signal)=>{
    const url = `${WORKER_BASE_URL}/replay`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${uploadToken}`
        },
        body: JSON.stringify({
            session_key: sessionKey,
            payload
        }),
        signal
    });
    if (!response.ok && response.status !== 204) {
        throw new Error(`Replay cache upload failed: ${response.status}`);
    }
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/api/rateLimiter.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  rateLimit: () => (rateLimit),
  sleep: () => (sleep)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const minIntervalMs = 400;
let rateLimitChain = Promise.resolve(0);
const sleep = (ms)=>new Promise((resolve)=>{
        setTimeout(resolve, ms);
    });
const rateLimit = ()=>{
    rateLimitChain = rateLimitChain.then(async (lastRequestAt)=>{
        const now = Date.now();
        const elapsed = now - lastRequestAt;
        if (elapsed < minIntervalMs) {
            await sleep(minIntervalMs - elapsed);
        }
        return Date.now();
    });
    return rateLimitChain;
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/ControlsBar.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  ControlsBar: () => (ControlsBar)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var lucide_react__rspack_import_3 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/pause.js");
/* import */ var lucide_react__rspack_import_4 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/play.js");
/* import */ var lucide_react__rspack_import_5 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/loader-circle.js");
/* import */ var lucide_react__rspack_import_6 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/skip-back.js");
/* import */ var lucide_react__rspack_import_7 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/skip-forward.js");
/* import */ var lucide_react__rspack_import_8 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/volume-2.js");
/* import */ var lucide_react__rspack_import_9 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/volume-x.js");
/* import */ var lucide_react__rspack_import_10 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/minimize-2.js");
/* import */ var lucide_react__rspack_import_11 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/maximize-2.js");
/* import */ var _utils_format_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* import */ var _TimelineSlider__rspack_import_2 = __webpack_require__("./src/modules/replay/components/TimelineSlider.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");




const ControlsBar = (param)=>{
    let { isPlaying, isBuffering, speed, currentTimeMs, startTimeMs, endTimeMs, canPlay, timelineEvents, radioEnabled, drivers, isRadioPlaying, skipIntervalLabel, expanded, onTogglePlay, onSkipBack, onSkipForward, onCycleSpeed, onCycleSkipInterval, onToggleExpanded, onSeek, onRadioToggle, onPlayRadio, onStopRadio, onPauseRadio, onResumeRadio, onMarkerClick } = param;
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex w-full flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-4 text-white backdrop-blur-xl",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: `mt-4 flex min-w-0 gap-3 text-xs text-white/60 ${expanded ? "items-end" : "items-center"}`,
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "shrink-0 font-mono text-xs tabular-nums text-white/50",
                        children: (0,_utils_format_util__rspack_import_1.formatTime)(currentTimeMs - startTimeMs)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "min-w-0 flex-1",
                        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_TimelineSlider__rspack_import_2.TimelineSlider, {
                            currentTimeMs: currentTimeMs,
                            startTimeMs: startTimeMs,
                            endTimeMs: endTimeMs,
                            events: timelineEvents,
                            drivers: drivers,
                            isPlaying: isPlaying,
                            radioEnabled: radioEnabled,
                            isRadioPlaying: isRadioPlaying,
                            expanded: expanded,
                            onSeek: onSeek,
                            onPlayRadio: onPlayRadio,
                            onStopRadio: onStopRadio,
                            onPauseRadio: onPauseRadio,
                            onResumeRadio: onResumeRadio,
                            onMarkerClick: onMarkerClick,
                            onTogglePlay: onTogglePlay
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 52,
                            columnNumber: 11
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "shrink-0 font-mono text-xs tabular-nums text-white/50",
                        children: (0,_utils_format_util__rspack_import_1.formatTime)(endTimeMs - startTimeMs)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex flex-wrap items-center gap-2",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        className: `flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${canPlay ? "bg-[#E10600] hover:bg-[#ff1801]" : "bg-white/10"}`,
                        onClick: onTogglePlay,
                        disabled: !canPlay,
                        children: canPlay ? isPlaying ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_3["default"], {
                            size: 18
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 89,
                            columnNumber: 15
                        }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_4["default"], {
                            size: 18
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 91,
                            columnNumber: 15
                        }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_5["default"], {
                            size: 18,
                            className: "animate-spin"
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 94,
                            columnNumber: 13
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 79,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        onClick: onSkipBack,
                        className: "flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white",
                        title: "Skip back",
                        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_6["default"], {
                            size: 16
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 105,
                            columnNumber: 11
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 99,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        onClick: onCycleSkipInterval,
                        className: "flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white/70 transition hover:bg-white/15 hover:text-white",
                        title: "Change skip interval",
                        children: skipIntervalLabel
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 109,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        onClick: onSkipForward,
                        className: "flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white",
                        title: "Skip forward",
                        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_7["default"], {
                            size: 16
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                            lineNumber: 125,
                            columnNumber: 11
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 119,
                        columnNumber: 9
                    }, undefined),
                    isBuffering && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "text-xs text-white/50",
                        children: "Buffering..."
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 128,
                        columnNumber: 25
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "ml-auto flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                                type: "button",
                                onClick: onCycleSpeed,
                                className: "flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white/70 transition hover:bg-white/15 hover:text-white",
                                title: "Cycle playback speed",
                                children: [
                                    speed,
                                    "x"
                                ]
                            }, void 0, true, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                lineNumber: 133,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                                type: "button",
                                onClick: onRadioToggle,
                                className: `flex h-8 w-8 items-center justify-center rounded-lg transition ${radioEnabled ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30" : "bg-white/10 text-white/50 hover:bg-white/15"}`,
                                title: radioEnabled ? "Disable team radio" : "Enable team radio",
                                children: radioEnabled ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_8["default"], {
                                    size: 16
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                    lineNumber: 153,
                                    columnNumber: 29
                                }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_9["default"], {
                                    size: 16
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                    lineNumber: 153,
                                    columnNumber: 53
                                }, undefined)
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                lineNumber: 143,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                                type: "button",
                                onClick: onToggleExpanded,
                                className: `flex h-8 w-8 items-center justify-center rounded-lg transition ${expanded ? "bg-white/20 text-white hover:bg-white/25" : "bg-white/10 text-white/50 hover:bg-white/15"}`,
                                title: expanded ? "Collapse timeline" : "Expand timeline",
                                children: expanded ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_10["default"], {
                                    size: 16
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                    lineNumber: 167,
                                    columnNumber: 25
                                }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_11["default"], {
                                    size: 16
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                    lineNumber: 167,
                                    columnNumber: 51
                                }, undefined)
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                                lineNumber: 157,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                        lineNumber: 131,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
                lineNumber: 77,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/ControlsBar.tsx",
        lineNumber: 45,
        columnNumber: 5
    }, undefined);
};
_c = ControlsBar;
var _c;
$RefreshReg$(_c, "ControlsBar");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/EventMarkerPopup.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  EventMarkerPopup: () => (EventMarkerPopup)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var _utils_format_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const TYPE_LABELS = {
    radio: "Team Radio",
    overtake: "Overtake",
    flag: "Flag",
    "safety-car": "Safety Car",
    pit: "Pit Stop",
    "race-control": "Race Control"
};
const EventMarkerPopup = (param)=>{
    let { event, startTimeMs } = param;
    const typeLabel = TYPE_LABELS[event.type] ?? event.type;
    const elapsed = (0,_utils_format_util__rspack_import_1.formatTime)(event.timestampMs - startTimeMs);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "w-56 rounded-lg border border-white/20 bg-black/90 p-3 text-xs text-white shadow-xl backdrop-blur-xl",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "mb-1 flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "inline-block h-2 w-2 rounded-full",
                        style: {
                            backgroundColor: event.color
                        }
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
                        lineNumber: 25,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "font-semibold",
                        children: typeLabel
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "ml-auto text-white/40",
                        children: elapsed
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
                        lineNumber: 30,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "text-white/70",
                children: event.detail
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/EventMarkerPopup.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, undefined);
};
_c = EventMarkerPopup;
var _c;
$RefreshReg$(_c, "EventMarkerPopup");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/MarkerLegend.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  MarkerLegend: () => (MarkerLegend)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var lucide_react__rspack_import_1 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/radio.js");
/* import */ var lucide_react__rspack_import_2 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/arrow-right-left.js");
/* import */ var lucide_react__rspack_import_3 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/flag.js");
/* import */ var lucide_react__rspack_import_4 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/shield-alert.js");
/* import */ var lucide_react__rspack_import_5 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/circle-dot.js");
/* import */ var lucide_react__rspack_import_6 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/triangle-alert.js");
/* import */ var lucide_react__rspack_import_7 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/chevron-right.js");
/* import */ var lucide_react__rspack_import_8 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/chevron-down.js");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const LEGEND_ITEMS = [
    {
        type: "radio",
        color: "#3b82f6",
        label: "Team Radio",
        icon: lucide_react__rspack_import_1["default"]
    },
    {
        type: "overtake",
        color: "#22c55e",
        label: "Overtake",
        icon: lucide_react__rspack_import_2["default"]
    },
    {
        type: "flag",
        color: "#eab308",
        label: "Flag",
        icon: lucide_react__rspack_import_3["default"]
    },
    {
        type: "safety-car",
        color: "#ef4444",
        label: "Safety Car",
        icon: lucide_react__rspack_import_4["default"]
    },
    {
        type: "pit",
        color: "#6b7280",
        label: "Pit Stop",
        icon: lucide_react__rspack_import_5["default"]
    },
    {
        type: "race-control",
        color: "#a855f7",
        label: "Race Control",
        icon: lucide_react__rspack_import_6["default"]
    }
];
const SHORTCUT_ITEMS = [
    {
        key: "Space",
        description: "Play / Pause"
    },
    {
        key: "← / →",
        description: "Skip back / forward"
    },
    {
        key: "S",
        description: "Cycle speed"
    },
    {
        key: "M",
        description: "Toggle radio"
    },
    {
        key: "I",
        description: "Cycle skip interval"
    },
    {
        key: "E",
        description: "Expand timeline"
    }
];
const MarkerLegend = (param)=>{
    let { hasEvents, legendCollapsed, onToggleLegendCollapsed, shortcutsCollapsed, onToggleShortcutsCollapsed } = param;
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex w-fit flex-row gap-0 rounded-xl border border-white/20 bg-white/5 text-xs text-white/70 backdrop-blur-xl md:flex-col",
        children: [
            hasEvents && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        onClick: onToggleLegendCollapsed,
                        className: "flex w-full items-center gap-1.5 px-3 py-2 text-left text-white/50 transition hover:text-white/70",
                        children: [
                            legendCollapsed ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_7["default"], {
                                size: 12
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 48,
                                columnNumber: 32
                            }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_8["default"], {
                                size: 12
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 48,
                                columnNumber: 61
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "text-[10px] font-semibold uppercase tracking-wider",
                                children: "Legend"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 49,
                                columnNumber: 13
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                        lineNumber: 43,
                        columnNumber: 11
                    }, undefined),
                    !legendCollapsed && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "flex flex-col gap-1 px-3 pb-2",
                        children: LEGEND_ITEMS.map((item)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "inline-flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(item.icon, {
                                        size: 14,
                                        style: {
                                            color: item.color
                                        }
                                    }, void 0, false, {
                                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                        lineNumber: 55,
                                        columnNumber: 19
                                    }, undefined),
                                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                        children: item.label
                                    }, void 0, false, {
                                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                        lineNumber: 56,
                                        columnNumber: 19
                                    }, undefined)
                                ]
                            }, item.type, true, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 54,
                                columnNumber: 17
                            }, undefined))
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                        lineNumber: 52,
                        columnNumber: 13
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                lineNumber: 42,
                columnNumber: 9
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: hasEvents ? "border-l border-white/10 md:border-l-0 md:border-t" : "",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        onClick: onToggleShortcutsCollapsed,
                        className: "flex w-full items-center gap-1.5 px-3 py-2 text-left text-white/50 transition hover:text-white/70",
                        children: [
                            shortcutsCollapsed ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_7["default"], {
                                size: 12
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 71,
                                columnNumber: 33
                            }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_8["default"], {
                                size: 12
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 71,
                                columnNumber: 62
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "text-[10px] font-semibold uppercase tracking-wider",
                                children: "Shortcuts"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 72,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, undefined),
                    !shortcutsCollapsed && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "flex flex-col gap-1 px-3 pb-2",
                        children: SHORTCUT_ITEMS.map((item)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "inline-flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("kbd", {
                                        className: "inline-block min-w-[28px] rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10px] text-white/60",
                                        children: item.key
                                    }, void 0, false, {
                                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                        lineNumber: 78,
                                        columnNumber: 17
                                    }, undefined),
                                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                        children: item.description
                                    }, void 0, false, {
                                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                        lineNumber: 81,
                                        columnNumber: 17
                                    }, undefined)
                                ]
                            }, item.key, true, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                                lineNumber: 77,
                                columnNumber: 15
                            }, undefined))
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                        lineNumber: 75,
                        columnNumber: 11
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/MarkerLegend.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, undefined);
};
_c = MarkerLegend;
var _c;
$RefreshReg$(_c, "MarkerLegend");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/RadioPopup.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  RadioPopup: () => (RadioPopup)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var lucide_react__rspack_import_2 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/pause.js");
/* import */ var lucide_react__rspack_import_3 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/play.js");
/* import */ var _utils_format_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");



const WaveformBars = (param)=>{
    let { active } = param;
    const bars = [
        {
            id: "b1",
            h: 40,
            delay: 0.4
        },
        {
            id: "b2",
            h: 70,
            delay: 0.5
        },
        {
            id: "b3",
            h: 50,
            delay: 0.6
        },
        {
            id: "b4",
            h: 85,
            delay: 0.7
        },
        {
            id: "b5",
            h: 60,
            delay: 0.8
        }
    ];
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex items-end gap-[2px]",
        style: {
            height: 20
        },
        children: bars.map((bar)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "w-[3px] rounded-sm bg-blue-400",
                style: {
                    height: active ? `${bar.h}%` : "20%",
                    transition: "height 0.15s ease",
                    animation: active ? `waveform ${bar.delay}s ease-in-out infinite alternate` : "none"
                }
            }, bar.id, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                lineNumber: 26,
                columnNumber: 9
            }, undefined))
    }, void 0, false, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
        lineNumber: 24,
        columnNumber: 5
    }, undefined);
};
_c = WaveformBars;
const RadioPopup = (param)=>{
    let { radio, drivers, startTimeMs, isPlaying, onPlay, onStop, showAudioControls = true } = param;
    const driver = drivers.find((d)=>d.driver_number === radio.driver_number);
    const name = (driver === null || driver === void 0 ? void 0 : driver.name_acronym) ?? String(radio.driver_number);
    const fullName = (driver === null || driver === void 0 ? void 0 : driver.broadcast_name) ?? (driver === null || driver === void 0 ? void 0 : driver.full_name) ?? name;
    const elapsed = (0,_utils_format_util__rspack_import_1.formatTime)(radio.timestampMs - startTimeMs);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "w-60 rounded-lg border border-white/20 bg-black/90 p-3 text-xs text-white shadow-xl backdrop-blur-xl",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("style", {
                children: `
        @keyframes waveform {
          from { height: 20%; }
          to { height: var(--wave-h, 80%); }
        }
      `
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                lineNumber: 56,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: `flex items-center gap-2 ${showAudioControls ? "mb-2" : ""}`,
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white",
                        style: {
                            backgroundColor: (driver === null || driver === void 0 ? void 0 : driver.team_colour) ? `#${driver.team_colour}` : "#3b82f6"
                        },
                        children: name.charAt(0)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                        lineNumber: 63,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "min-w-0 flex-1",
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "truncate font-semibold",
                                children: fullName
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                                lineNumber: 70,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "text-white/40",
                                children: elapsed
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                                lineNumber: 71,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                        lineNumber: 69,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, undefined),
            showAudioControls && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex items-center gap-3",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                        type: "button",
                        className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition hover:bg-blue-400",
                        onClick: ()=>isPlaying ? onStop() : onPlay(radio),
                        children: isPlaying ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_2["default"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                            lineNumber: 81,
                            columnNumber: 26
                        }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_3["default"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                            lineNumber: 81,
                            columnNumber: 48
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                        lineNumber: 76,
                        columnNumber: 11
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(WaveformBars, {
                        active: isPlaying
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                        lineNumber: 83,
                        columnNumber: 11
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
                lineNumber: 75,
                columnNumber: 9
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/RadioPopup.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, undefined);
};
_c1 = RadioPopup;
var _c, _c1;
$RefreshReg$(_c, "WaveformBars");
$RefreshReg$(_c1, "RadioPopup");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/SessionPicker.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  SessionPicker: () => (SessionPicker)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

const SESSION_TYPES = [
    "Race",
    "Sprint",
    "Qualifying"
];
const buildYearOptions = (currentYear)=>{
    const years = [];
    for(let year = currentYear; year >= currentYear - 5; year -= 1){
        years.push(year);
    }
    return years;
};
const SessionPicker = (param)=>{
    let { year, round, sessionType, meetings, sessions, yearOptions: availableYears, onYearChange, onRoundChange, onSessionTypeChange } = param;
    const yearOptions = availableYears && availableYears.length > 0 ? availableYears : buildYearOptions(new Date().getFullYear());
    const rounds = meetings.map((meeting, index)=>({
            round: index + 1,
            label: meeting.meeting_name
        }));
    const availableTypes = sessions.map((session)=>session.session_type);
    const hasSessionType = availableTypes.includes(sessionType);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex w-full flex-nowrap items-end gap-2 overflow-hidden text-xs md:flex-wrap md:items-center md:gap-3",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex w-20 flex-col gap-1 sm:w-24 md:w-auto",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "text-[10px] uppercase text-white/60",
                        children: "Year"
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 38,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("select", {
                        id: "replay-year",
                        name: "replay-year",
                        value: year,
                        onChange: (event)=>onYearChange(Number(event.target.value)),
                        className: "w-full appearance-none rounded-md border border-white/20 bg-white/5 px-2 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70 md:px-3",
                        children: yearOptions.map((option)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("option", {
                                value: option,
                                children: option
                            }, option, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                                lineNumber: 47,
                                columnNumber: 13
                            }, undefined))
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 39,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex min-w-0 flex-1 flex-col gap-1",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "text-[10px] uppercase text-white/60",
                        children: "Round"
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("select", {
                        id: "replay-round",
                        name: "replay-round",
                        value: round,
                        onChange: (event)=>onRoundChange(Number(event.target.value)),
                        className: "w-full appearance-none truncate rounded-md border border-white/20 bg-white/5 px-2 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70 md:px-3",
                        children: rounds.map((option)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("option", {
                                value: option.round,
                                children: [
                                    option.round,
                                    ". ",
                                    option.label
                                ]
                            }, option.round, true, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                                lineNumber: 63,
                                columnNumber: 13
                            }, undefined))
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 55,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex w-24 flex-col gap-1 sm:w-28 md:w-auto",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "text-[10px] uppercase text-white/60",
                        children: "Session"
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("select", {
                        id: "replay-session",
                        name: "replay-session",
                        value: sessionType,
                        onChange: (event)=>onSessionTypeChange(event.target.value),
                        className: "w-full appearance-none rounded-md border border-white/20 bg-white/5 px-2 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/70 md:px-3",
                        children: SESSION_TYPES.map((type)=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("option", {
                                value: type,
                                children: type
                            }, type, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                                lineNumber: 79,
                                columnNumber: 13
                            }, undefined))
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, undefined),
            !hasSessionType && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "text-[11px] text-amber-300",
                children: "Session not available for this round."
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
                lineNumber: 86,
                columnNumber: 9
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/SessionPicker.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, undefined);
};
_c = SessionPicker;
var _c;
$RefreshReg$(_c, "SessionPicker");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/TelemetryPanel.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  TelemetryPanel: () => (TelemetryPanel)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var framer_motion__rspack_import_2 = __webpack_require__("./node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs");
/* import */ var framer_motion__rspack_import_3 = __webpack_require__("./node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs");
/* import */ var _utils_format_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");



const getOvertakeRole = (driverNumber, activeOvertakes)=>{
    for (const ot of activeOvertakes){
        if (driverNumber === ot.overtaking_driver_number) return "overtaking";
        if (driverNumber === ot.overtaken_driver_number) return "overtaken";
    }
    return null;
};
const overtakeStyles = {
    overtaking: "ring-2 ring-inset ring-green-400/70 bg-green-500/10",
    overtaken: "ring-2 ring-inset ring-red-400/70 bg-red-500/10"
};
const TelemetryPanel = (param)=>{
    let { summary, rows, activeOvertakes = [] } = param;
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex h-full flex-col gap-3 rounded-xl border border-white/20 bg-white/5 p-4 backdrop-blur-xl",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                    className: "text-sm font-semibold text-white",
                    children: "Leaderboard"
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                    lineNumber: 25,
                    columnNumber: 9
                }, undefined)
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "grid grid-cols-2 gap-2 text-[11px] text-white/70",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "text-[10px] uppercase text-white/40",
                                children: "Coverage"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 30,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "text-white/80",
                                children: summary.coverageLabel
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 31,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "text-[10px] uppercase text-white/40",
                                children: "Drivers"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 34,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "text-white/80",
                                children: summary.totalDrivers
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 35,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                        lineNumber: 33,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "flex-1 overflow-y-auto pr-1",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "grid grid-cols-[0.45fr_2fr_0.55fr_0.55fr] gap-1 text-[10px] uppercase text-white/40",
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "text-center",
                                children: "Pos"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 41,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                children: "Driver"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 42,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "text-center",
                                children: "Lap"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 43,
                                columnNumber: 11
                            }, undefined),
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "text-center",
                                children: "Tyre"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                lineNumber: 44,
                                columnNumber: 11
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "mt-2 flex flex-col gap-2 text-xs",
                        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(framer_motion__rspack_import_2.AnimatePresence, {
                            initial: false,
                            mode: "popLayout",
                            children: rows.map((row)=>{
                                const role = getOvertakeRole(row.driverNumber, activeOvertakes);
                                const overtakeClass = role ? overtakeStyles[role] : "";
                                return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(framer_motion__rspack_import_3.motion.div, {
                                    layout: "position",
                                    initial: {
                                        opacity: 0,
                                        scale: 0.95
                                    },
                                    animate: {
                                        opacity: 1,
                                        scale: 1
                                    },
                                    exit: {
                                        opacity: 0,
                                        scale: 0.95
                                    },
                                    transition: {
                                        layout: {
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                            mass: 0.8
                                        },
                                        opacity: {
                                            duration: 0.2
                                        },
                                        scale: {
                                            duration: 0.2
                                        }
                                    },
                                    className: `grid grid-cols-[0.45fr_2fr_0.55fr_0.55fr] items-center gap-1 rounded-lg bg-white/5 px-2 py-2 transition-shadow duration-500 ${overtakeClass}`,
                                    children: [
                                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                            className: "text-center text-white/80",
                                            children: row.position ?? "-"
                                        }, void 0, false, {
                                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                            lineNumber: 65,
                                            columnNumber: 19
                                        }, undefined),
                                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                            className: "min-w-0",
                                            children: [
                                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                                    className: "truncate text-white",
                                                    children: row.driverName
                                                }, void 0, false, {
                                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                                    lineNumber: 67,
                                                    columnNumber: 21
                                                }, undefined),
                                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                                    className: "text-[10px] text-white/40",
                                                    children: [
                                                        "#",
                                                        row.driverNumber,
                                                        row.driverAcronym ? ` · ${row.driverAcronym}` : ""
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                                    lineNumber: 68,
                                                    columnNumber: 21
                                                }, undefined)
                                            ]
                                        }, void 0, true, {
                                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                            lineNumber: 66,
                                            columnNumber: 19
                                        }, undefined),
                                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                            className: "text-center text-white/80",
                                            children: row.lap ?? "-"
                                        }, void 0, false, {
                                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                            lineNumber: 73,
                                            columnNumber: 19
                                        }, undefined),
                                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                            className: "flex justify-center",
                                            children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                                className: "rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/70",
                                                title: (0,_utils_format_util__rspack_import_1.getCompoundLabel)(row.compound),
                                                children: (0,_utils_format_util__rspack_import_1.getCompoundBadge)(row.compound)
                                            }, void 0, false, {
                                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                                lineNumber: 75,
                                                columnNumber: 21
                                            }, undefined)
                                        }, void 0, false, {
                                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                            lineNumber: 74,
                                            columnNumber: 19
                                        }, undefined)
                                    ]
                                }, row.driverNumber, true, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                                    lineNumber: 52,
                                    columnNumber: 17
                                }, undefined);
                            })
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                            lineNumber: 47,
                            columnNumber: 11
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                        lineNumber: 46,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TelemetryPanel.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, undefined);
};
_c = TelemetryPanel;
var _c;
$RefreshReg$(_c, "TelemetryPanel");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/TimelineSlider.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  TimelineSlider: () => (TimelineSlider)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var react__rspack_import_1 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_1_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_1);
/* import */ var react_dom__rspack_import_2 = __webpack_require__("./node_modules/react-dom/index.js");
/* import */ var _EventMarkerPopup__rspack_import_3 = __webpack_require__("./src/modules/replay/components/EventMarkerPopup.tsx");
/* import */ var _RadioPopup__rspack_import_4 = __webpack_require__("./src/modules/replay/components/RadioPopup.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

var _s = $RefreshSig$();




const EVENT_WINDOW_MS = 2000;
const EVENT_DISPLAY_DURATION_MS = 5000;
const EXPAND_SCALE = 10;
const HANDLE_VIEWPORT_RATIO = 0.3;
const TimelineSlider = (param)=>{
    let { currentTimeMs, startTimeMs, endTimeMs, events, drivers, isPlaying, radioEnabled, isRadioPlaying, expanded, onSeek, onPlayRadio, onStopRadio, onPauseRadio, onResumeRadio, onTogglePlay, onMarkerClick } = param;
    _s();
    const trackRef = (0,react__rspack_import_1.useRef)(null);
    const scrollContainerRef = (0,react__rspack_import_1.useRef)(null);
    const isDragging = (0,react__rspack_import_1.useRef)(false);
    const hoverTimeout = (0,react__rspack_import_1.useRef)(null);
    // Drag-pause refs for expanded mode
    const userDraggingRef = (0,react__rspack_import_1.useRef)(false);
    const wasPlayingBeforeDragRef = (0,react__rspack_import_1.useRef)(false);
    // Manual hover state (user-initiated)
    const [hoveredEvent, setHoveredEvent] = (0,react__rspack_import_1.useState)(null);
    const [hoverPos, setHoverPos] = (0,react__rspack_import_1.useState)(null);
    // Auto-shown popup state (playback-initiated)
    const [autoShownEvent, setAutoShownEvent] = (0,react__rspack_import_1.useState)(null);
    const [autoHoverPos, setAutoHoverPos] = (0,react__rspack_import_1.useState)(null);
    const autoTimerRef = (0,react__rspack_import_1.useRef)(null);
    const processedEventsRef = (0,react__rspack_import_1.useRef)(new Set());
    const lastTimeMsRef = (0,react__rspack_import_1.useRef)(currentTimeMs);
    // Track whether radio was playing before race was paused
    const wasPlayingBeforePauseRef = (0,react__rspack_import_1.useRef)(false);
    const prevIsPlayingRef = (0,react__rspack_import_1.useRef)(isPlaying);
    // Refs for stable access in effects
    const eventsRef = (0,react__rspack_import_1.useRef)(events);
    eventsRef.current = events;
    const isPlayingRef = (0,react__rspack_import_1.useRef)(isPlaying);
    isPlayingRef.current = isPlaying;
    const hoveredEventRef = (0,react__rspack_import_1.useRef)(hoveredEvent);
    hoveredEventRef.current = hoveredEvent;
    const radioEnabledRef = (0,react__rspack_import_1.useRef)(radioEnabled);
    radioEnabledRef.current = radioEnabled;
    const isRadioPlayingRef = (0,react__rspack_import_1.useRef)(isRadioPlaying);
    isRadioPlayingRef.current = isRadioPlaying;
    const autoShownEventRef = (0,react__rspack_import_1.useRef)(autoShownEvent);
    autoShownEventRef.current = autoShownEvent;
    const onPlayRadioRef = (0,react__rspack_import_1.useRef)(onPlayRadio);
    onPlayRadioRef.current = onPlayRadio;
    const onStopRadioRef = (0,react__rspack_import_1.useRef)(onStopRadio);
    onStopRadioRef.current = onStopRadio;
    const expandedRef = (0,react__rspack_import_1.useRef)(expanded);
    expandedRef.current = expanded;
    const onTogglePlayRef = (0,react__rspack_import_1.useRef)(onTogglePlay);
    onTogglePlayRef.current = onTogglePlay;
    const duration = Math.max(1, endTimeMs - startTimeMs);
    const progress = (currentTimeMs - startTimeMs) / duration * 100;
    // Determine which popup to display (manual hover takes priority)
    const displayedEvent = hoveredEvent ?? autoShownEvent;
    const displayedPos = hoveredEvent ? hoverPos : autoHoverPos;
    const seekFromPointer = (0,react__rspack_import_1.useCallback)((clientX)=>{
        const track = trackRef.current;
        if (!track) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        onSeek(startTimeMs + ratio * duration);
    }, [
        startTimeMs,
        duration,
        onSeek
    ]);
    const onPointerDown = (0,react__rspack_import_1.useCallback)((e)=>{
        isDragging.current = true;
        e.target.setPointerCapture(e.pointerId);
        // In expanded mode, pause race on drag start
        if (expandedRef.current) {
            userDraggingRef.current = true;
            if (isPlayingRef.current) {
                wasPlayingBeforeDragRef.current = true;
                onTogglePlayRef.current();
            } else {
                wasPlayingBeforeDragRef.current = false;
            }
        }
        seekFromPointer(e.clientX);
    }, [
        seekFromPointer
    ]);
    const onPointerMove = (0,react__rspack_import_1.useCallback)((e)=>{
        if (isDragging.current) {
            seekFromPointer(e.clientX);
        }
    }, [
        seekFromPointer
    ]);
    const onPointerUp = (0,react__rspack_import_1.useCallback)(()=>{
        isDragging.current = false;
        // In expanded mode, resume race on drag end if it was playing before
        if (expandedRef.current && userDraggingRef.current) {
            userDraggingRef.current = false;
            if (wasPlayingBeforeDragRef.current) {
                wasPlayingBeforeDragRef.current = false;
                onTogglePlayRef.current();
            }
        }
    }, []);
    const computeMarkerPercent = (0,react__rspack_import_1.useCallback)((timestampMs)=>{
        return (timestampMs - startTimeMs) / duration * 100;
    }, [
        startTimeMs,
        duration
    ]);
    const handleMarkerEnter = (event, buttonEl)=>{
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setHoveredEvent(event);
        const rect = buttonEl.getBoundingClientRect();
        setHoverPos({
            x: rect.left + rect.width / 2,
            y: rect.top
        });
    };
    const clearAutoPopup = (0,react__rspack_import_1.useCallback)(()=>{
        if (autoTimerRef.current) {
            clearTimeout(autoTimerRef.current);
            autoTimerRef.current = null;
        }
        setAutoShownEvent(null);
        setAutoHoverPos(null);
    }, []);
    const closePopup = (0,react__rspack_import_1.useCallback)(()=>{
        if ((hoveredEvent === null || hoveredEvent === void 0 ? void 0 : hoveredEvent.type) === "radio" && isRadioPlaying) {
            onStopRadio();
        }
        setHoveredEvent(null);
        setHoverPos(null);
    }, [
        hoveredEvent,
        isRadioPlaying,
        onStopRadio
    ]);
    const handleMarkerLeave = ()=>{
        hoverTimeout.current = setTimeout(closePopup, 200);
    };
    const handlePopupEnter = ()=>{
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };
    const handlePopupLeave = ()=>{
        if (hoveredEvent) {
            closePopup();
        }
    };
    // Reset processed events when session changes
    const startTimeMsRef = (0,react__rspack_import_1.useRef)(startTimeMs);
    (0,react__rspack_import_1.useEffect)(()=>{
        if (startTimeMsRef.current !== startTimeMs) {
            startTimeMsRef.current = startTimeMs;
            processedEventsRef.current.clear();
            clearAutoPopup();
        }
    }, [
        startTimeMs,
        clearAutoPopup
    ]);
    // Auto-show event popups during playback
    (0,react__rspack_import_1.useEffect)(()=>{
        if (!isPlayingRef.current || eventsRef.current.length === 0) return;
        const prevTime = lastTimeMsRef.current;
        lastTimeMsRef.current = currentTimeMs;
        if (currentTimeMs <= prevTime) return;
        if (hoveredEventRef.current) return;
        for (const event of eventsRef.current){
            const diff = currentTimeMs - event.timestampMs;
            if (diff >= 0 && diff <= EVENT_WINDOW_MS) {
                const key = `${event.type}-${event.timestampMs}`;
                if (!processedEventsRef.current.has(key)) {
                    processedEventsRef.current.add(key);
                    const trackEl = trackRef.current;
                    if (trackEl) {
                        var _autoShownEventRef_current;
                        const trackRect = trackEl.getBoundingClientRect();
                        const left = computeMarkerPercent(event.timestampMs);
                        const x = trackRect.left + left / 100 * trackRect.width;
                        const y = trackRect.top - 20;
                        if (autoTimerRef.current) {
                            clearTimeout(autoTimerRef.current);
                        }
                        if (((_autoShownEventRef_current = autoShownEventRef.current) === null || _autoShownEventRef_current === void 0 ? void 0 : _autoShownEventRef_current.type) === "radio" && isRadioPlayingRef.current) {
                            onStopRadioRef.current();
                        }
                        setAutoShownEvent(event);
                        setAutoHoverPos({
                            x,
                            y
                        });
                        if (event.type === "radio" && radioEnabledRef.current) {
                            onPlayRadioRef.current(event.data);
                        }
                        autoTimerRef.current = setTimeout(()=>{
                            setAutoShownEvent((current)=>{
                                if (current === event) {
                                    if (event.type === "radio") {
                                        onStopRadioRef.current();
                                    }
                                    return null;
                                }
                                return current;
                            });
                            setAutoHoverPos(null);
                            autoTimerRef.current = null;
                        }, EVENT_DISPLAY_DURATION_MS);
                    }
                    break;
                }
            }
        }
    }, [
        currentTimeMs,
        computeMarkerPercent
    ]);
    // Handle race pause/resume -> radio pause/resume
    (0,react__rspack_import_1.useEffect)(()=>{
        const wasPreviouslyPlaying = prevIsPlayingRef.current;
        prevIsPlayingRef.current = isPlaying;
        if (wasPreviouslyPlaying && !isPlaying) {
            if (isRadioPlaying) {
                wasPlayingBeforePauseRef.current = true;
                onPauseRadio();
            } else {
                wasPlayingBeforePauseRef.current = false;
            }
        }
        if (!wasPreviouslyPlaying && isPlaying) {
            if (wasPlayingBeforePauseRef.current && (autoShownEvent === null || autoShownEvent === void 0 ? void 0 : autoShownEvent.type) === "radio") {
                onResumeRadio();
            }
            wasPlayingBeforePauseRef.current = false;
        }
    }, [
        isPlaying,
        isRadioPlaying,
        onPauseRadio,
        onResumeRadio,
        autoShownEvent
    ]);
    // Update lastTimeMsRef for seek detection
    (0,react__rspack_import_1.useEffect)(()=>{
        lastTimeMsRef.current = currentTimeMs;
    }, [
        currentTimeMs
    ]);
    // Auto-scroll in expanded mode: keep handle at 30% from left
    (0,react__rspack_import_1.useEffect)(()=>{
        if (!expanded || userDraggingRef.current) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const visibleWidth = container.clientWidth;
        const innerWidth = visibleWidth * EXPAND_SCALE;
        const handlePixelX = progress / 100 * innerWidth;
        const targetScroll = handlePixelX - visibleWidth * HANDLE_VIEWPORT_RATIO;
        container.scrollLeft = Math.max(0, Math.min(targetScroll, innerWidth - visibleWidth));
    }, [
        expanded,
        progress
    ]);
    // Marker row shared between both modes
    const markerRow = /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "relative h-3",
        children: events.map((event, index)=>{
            const left = computeMarkerPercent(event.timestampMs);
            if (left < 0 || left > 100) return null;
            return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("button", {
                type: "button",
                className: "absolute bottom-0 w-[3px] cursor-pointer border-none bg-transparent p-0 pb-0 pt-4",
                style: {
                    left: `${left}%`,
                    transform: "translateX(-50%)"
                },
                onClick: ()=>onMarkerClick === null || onMarkerClick === void 0 ? void 0 : onMarkerClick(event.timestampMs),
                onMouseEnter: (e)=>handleMarkerEnter(event, e.currentTarget),
                onMouseLeave: handleMarkerLeave,
                children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                    className: "block h-3 w-[3px] rounded-sm",
                    style: {
                        backgroundColor: event.color,
                        opacity: 0.8
                    }
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                    lineNumber: 331,
                    columnNumber: 13
                }, undefined)
            }, `${event.type}-${event.timestampMs}-${index}`, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 319,
                columnNumber: 11
            }, undefined);
        })
    }, void 0, false, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
        lineNumber: 314,
        columnNumber: 5
    }, undefined);
    // Track bar shared between both modes
    const trackBar = /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        ref: trackRef,
        className: "relative h-2 cursor-pointer rounded-full bg-white/10",
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "absolute inset-y-0 left-0 rounded-full bg-[#E10600]",
                style: {
                    width: `${Math.min(100, Math.max(0, progress))}%`
                }
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 350,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-[height,width] duration-150 hover:h-5 hover:w-2",
                style: {
                    left: `${Math.min(100, Math.max(0, progress))}%`
                }
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 354,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
        lineNumber: 343,
        columnNumber: 5
    }, undefined);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "relative w-full select-none",
        children: [
            expanded ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                ref: scrollContainerRef,
                className: "overflow-x-auto",
                style: {
                    scrollbarWidth: "none"
                },
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("style", {
                        children: `
            .timeline-scroll-hide::-webkit-scrollbar { display: none; }
          `
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                        lineNumber: 369,
                        columnNumber: 11
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "timeline-scroll-hide",
                        style: {
                            width: `${EXPAND_SCALE * 100}%`
                        },
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                                className: "mb-1",
                                children: markerRow
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                                lineNumber: 376,
                                columnNumber: 13
                            }, undefined),
                            trackBar
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                        lineNumber: 372,
                        columnNumber: 11
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 364,
                columnNumber: 9
            }, undefined) : /* Non-expanded: markers absolutely positioned above track so they
           don't affect component height — keeps timers aligned with the track bar */ /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "relative",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "absolute inset-x-0 bottom-full mb-1",
                        children: markerRow
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                        lineNumber: 384,
                        columnNumber: 11
                    }, undefined),
                    trackBar
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 383,
                columnNumber: 9
            }, undefined),
            displayedEvent && displayedPos && /*#__PURE__*/ (0,react_dom__rspack_import_2.createPortal)(/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                role: "tooltip",
                className: "fixed z-9999",
                style: {
                    left: displayedPos.x,
                    top: displayedPos.y - 8,
                    transform: "translate(-50%, -100%)"
                },
                onMouseEnter: handlePopupEnter,
                onMouseLeave: handlePopupLeave,
                children: displayedEvent.type === "radio" ? /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_RadioPopup__rspack_import_4.RadioPopup, {
                    radio: displayedEvent.data,
                    drivers: drivers,
                    startTimeMs: startTimeMs,
                    isPlaying: isRadioPlaying,
                    onPlay: onPlayRadio,
                    onStop: onStopRadio,
                    showAudioControls: radioEnabled
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                    lineNumber: 407,
                    columnNumber: 15
                }, undefined) : /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_EventMarkerPopup__rspack_import_3.EventMarkerPopup, {
                    event: displayedEvent,
                    startTimeMs: startTimeMs
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                    lineNumber: 417,
                    columnNumber: 15
                }, undefined)
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
                lineNumber: 395,
                columnNumber: 11
            }, undefined), document.body)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TimelineSlider.tsx",
        lineNumber: 362,
        columnNumber: 5
    }, undefined);
};
_s(TimelineSlider, "LPEa3yhgU+od0xf7/9J9Rg3PjJg=");
_c = TimelineSlider;
var _c;
$RefreshReg$(_c, "TimelineSlider");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/TrackView.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  TrackView: () => (TrackView)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var react__rspack_import_1 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_1_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_1);
/* import */ var _utils_geometry_util__rspack_import_2 = __webpack_require__("./src/modules/replay/utils/geometry.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

var _s = $RefreshSig$();


const TrackView = (param)=>{
    let { trackPath, driverStates, driverNames, selectedDrivers, className } = param;
    _s();
    const scaledTrack = (0,react__rspack_import_1.useMemo)(()=>trackPath.map(_utils_geometry_util__rspack_import_2.toPoint2D), [
        trackPath
    ]);
    const bounds = (0,react__rspack_import_1.useMemo)(()=>(0,_utils_geometry_util__rspack_import_2.computeBounds)(scaledTrack), [
        scaledTrack
    ]);
    const pathD = (0,react__rspack_import_1.useMemo)(()=>(0,_utils_geometry_util__rspack_import_2.buildPathD)(scaledTrack), [
        scaledTrack
    ]);
    const viewBox = (0,react__rspack_import_1.useMemo)(()=>{
        const width = Math.max(bounds.width, 1);
        const height = Math.max(bounds.height, 1);
        return `${bounds.minX - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING} ${bounds.minY - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING} ${width + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING * 2} ${height + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING * 2}`;
    }, [
        bounds
    ]);
    const driverEntries = (0,react__rspack_import_1.useMemo)(()=>{
        return Object.entries(driverStates).filter((param)=>{
            let [, state] = param;
            return state.position !== null;
        }).map((param)=>{
            let [driverKey, state] = param;
            const driverNumber = Number(driverKey);
            const position = (0,_utils_geometry_util__rspack_import_2.toPoint2D)(state.position);
            const name = driverNames[driverNumber] ?? String(driverNumber);
            const labelText = state.racePosition ? `P${state.racePosition} ${name}` : name;
            const offset = (0,_utils_geometry_util__rspack_import_2.computeLabelOffset)(position, bounds.center);
            return {
                driverKey,
                driverNumber,
                position,
                labelText,
                labelWidth: (0,_utils_geometry_util__rspack_import_2.getLabelWidth)(labelText),
                initialLabelX: position.x + offset.x,
                initialLabelY: position.y + offset.y,
                color: state.color,
                isSelected: selectedDrivers.includes(driverNumber)
            };
        });
    }, [
        driverStates,
        driverNames,
        bounds.center,
        selectedDrivers
    ]);
    const prevLabelsRef = (0,react__rspack_import_1.useRef)([]);
    // Inset the clamping bounds so labels stay away from edges that overlap UI panels
    const LABEL_SAFE_INSET = 80;
    const viewboxBounds = (0,react__rspack_import_1.useMemo)(()=>({
            minX: bounds.minX - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING + LABEL_SAFE_INSET,
            minY: bounds.minY - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING + LABEL_SAFE_INSET,
            maxX: bounds.maxX + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING - LABEL_SAFE_INSET,
            maxY: bounds.maxY + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING - LABEL_SAFE_INSET
        }), [
        bounds
    ]);
    const resolvedLabels = (0,react__rspack_import_1.useMemo)(()=>{
        if (driverEntries.length === 0) {
            prevLabelsRef.current = [];
            return [];
        }
        const prevMap = new Map();
        for (const label of prevLabelsRef.current){
            prevMap.set(label.key, label);
        }
        const hasPrev = prevMap.size > 0;
        const smoothFactor = 0.18;
        // Build rects starting from previous resolved positions (if available)
        // and gently pulling toward new ideal positions.
        // Since previous positions are already non-overlapping, collision
        // resolution only needs small adjustments -> stable, no jumping.
        const rects = driverEntries.map((entry)=>{
            const targetX = entry.initialLabelX;
            const targetY = entry.initialLabelY;
            const prev = hasPrev ? prevMap.get(entry.driverKey) : undefined;
            return {
                key: entry.driverKey,
                x: prev ? prev.x + (targetX - prev.x) * smoothFactor : targetX,
                y: prev ? prev.y + (targetY - prev.y) * smoothFactor : targetY,
                width: entry.labelWidth,
                height: _utils_geometry_util__rspack_import_2.LABEL_HEIGHT,
                anchorX: entry.position.x,
                anchorY: entry.position.y
            };
        });
        const resolved = (0,_utils_geometry_util__rspack_import_2.resolveCollisions)(rects, undefined, viewboxBounds);
        prevLabelsRef.current = resolved;
        return resolved;
    }, [
        driverEntries,
        viewboxBounds
    ]);
    const labelMap = (0,react__rspack_import_1.useMemo)(()=>{
        const map = new Map();
        for (const label of resolvedLabels){
            map.set(label.key, label);
        }
        return map;
    }, [
        resolvedLabels
    ]);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("svg", {
        className: className,
        viewBox: viewBox,
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "F1 track replay",
        role: "img",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("rect", {
                x: bounds.minX - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING,
                y: bounds.minY - _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING,
                width: bounds.width + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING * 2,
                height: bounds.height + _utils_geometry_util__rspack_import_2.VIEWBOX_PADDING * 2,
                fill: "transparent"
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                lineNumber: 125,
                columnNumber: 7
            }, undefined),
            pathD && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("path", {
                d: pathD,
                fill: "none",
                stroke: "#E10600",
                strokeWidth: "4",
                strokeLinecap: "butt",
                strokeLinejoin: "miter",
                shapeRendering: "geometricPrecision"
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                lineNumber: 133,
                columnNumber: 9
            }, undefined),
            driverEntries.map((entry)=>{
                const resolved = labelMap.get(entry.driverKey);
                const labelX = (resolved === null || resolved === void 0 ? void 0 : resolved.x) ?? entry.initialLabelX;
                const labelY = (resolved === null || resolved === void 0 ? void 0 : resolved.y) ?? entry.initialLabelY;
                const colorBarWidth = 4;
                return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("g", {
                    children: [
                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("line", {
                            x1: entry.position.x,
                            y1: entry.position.y,
                            x2: labelX,
                            y2: labelY,
                            stroke: entry.color,
                            strokeWidth: "1",
                            strokeOpacity: 0.5
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                            lineNumber: 152,
                            columnNumber: 13
                        }, undefined),
                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("g", {
                            transform: `translate(${labelX}, ${labelY})`,
                            children: [
                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("rect", {
                                    x: -entry.labelWidth / 2,
                                    y: -_utils_geometry_util__rspack_import_2.LABEL_HEIGHT / 2,
                                    width: entry.labelWidth,
                                    height: _utils_geometry_util__rspack_import_2.LABEL_HEIGHT,
                                    rx: "4",
                                    fill: "rgba(0,0,0,0.85)",
                                    stroke: "rgba(255,255,255,0.2)",
                                    strokeWidth: "0.8"
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                                    lineNumber: 163,
                                    columnNumber: 15
                                }, undefined),
                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("rect", {
                                    x: -entry.labelWidth / 2,
                                    y: -_utils_geometry_util__rspack_import_2.LABEL_HEIGHT / 2,
                                    width: colorBarWidth,
                                    height: _utils_geometry_util__rspack_import_2.LABEL_HEIGHT,
                                    rx: "4",
                                    fill: entry.color
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                                    lineNumber: 174,
                                    columnNumber: 15
                                }, undefined),
                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("rect", {
                                    x: -entry.labelWidth / 2 + colorBarWidth - 2,
                                    y: -_utils_geometry_util__rspack_import_2.LABEL_HEIGHT / 2,
                                    width: 4,
                                    height: _utils_geometry_util__rspack_import_2.LABEL_HEIGHT,
                                    fill: "rgba(0,0,0,0.85)"
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                                    lineNumber: 183,
                                    columnNumber: 15
                                }, undefined),
                                /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("text", {
                                    textAnchor: "middle",
                                    x: colorBarWidth / 2,
                                    dy: "4.5",
                                    fill: "#FFFFFF",
                                    fontSize: "13",
                                    fontWeight: "600",
                                    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
                                    children: entry.labelText
                                }, void 0, false, {
                                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                                    lineNumber: 190,
                                    columnNumber: 15
                                }, undefined)
                            ]
                        }, void 0, true, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                            lineNumber: 162,
                            columnNumber: 13
                        }, undefined),
                        /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("circle", {
                            cx: entry.position.x,
                            cy: entry.position.y,
                            r: entry.isSelected ? 8 : 6,
                            fill: entry.color,
                            stroke: entry.isSelected ? "#E10600" : "#FFFFFF",
                            strokeOpacity: entry.isSelected ? 1 : 0.7,
                            strokeWidth: entry.isSelected ? "2" : "1"
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                            lineNumber: 203,
                            columnNumber: 13
                        }, undefined)
                    ]
                }, entry.driverKey, true, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
                    lineNumber: 150,
                    columnNumber: 11
                }, undefined);
            })
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/TrackView.tsx",
        lineNumber: 118,
        columnNumber: 5
    }, undefined);
};
_s(TrackView, "Hx5g9NpJ5Dk0M16mJBaFwGnEKso=");
_c = TrackView;
var _c;
$RefreshReg$(_c, "TrackView");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/components/WeatherBadge.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  WeatherBadge: () => (WeatherBadge)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var lucide_react__rspack_import_1 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/thermometer.js");
/* import */ var lucide_react__rspack_import_2 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/gauge.js");
/* import */ var lucide_react__rspack_import_3 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/cloud-rain.js");
/* import */ var lucide_react__rspack_import_4 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/wind.js");
/* import */ var lucide_react__rspack_import_5 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/arrow-up.js");
/* import */ var lucide_react__rspack_import_6 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/droplets.js");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const COMPASS_DIRECTIONS = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW"
];
const degreesToCompass = (deg)=>{
    const index = Math.round((deg % 360 + 360) % 360 / 45) % 8;
    return COMPASS_DIRECTIONS[index];
};
const msToKmh = (ms)=>{
    return (ms * 3.6).toFixed(1);
};
const WeatherBadge = (param)=>{
    let { weather } = param;
    if (!weather) return null;
    const isRaining = weather.rainfall > 0;
    const compassDir = degreesToCompass(weather.wind_direction);
    const windKmh = msToKmh(weather.wind_speed);
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "flex flex-wrap items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "inline-flex items-center gap-1",
                title: "Air temperature",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_1["default"], {
                        size: 16
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, undefined),
                    " ",
                    weather.air_temperature,
                    "\xb0C"
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "text-white/20",
                children: "|"
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "inline-flex items-center gap-1",
                title: "Track temperature",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_2["default"], {
                        size: 16
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 33,
                        columnNumber: 9
                    }, undefined),
                    " ",
                    weather.track_temperature,
                    "\xb0C"
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, undefined),
            isRaining && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(react_jsx_dev_runtime__rspack_import_0.Fragment, {
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "text-white/20",
                        children: "|"
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 37,
                        columnNumber: 11
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                        className: "inline-flex items-center gap-1 text-blue-300",
                        title: "Rainfall",
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_3["default"], {
                                size: 16
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                                lineNumber: 39,
                                columnNumber: 13
                            }, undefined),
                            " Rain"
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 38,
                        columnNumber: 11
                    }, undefined)
                ]
            }, void 0, true),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "text-white/20",
                children: "|"
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 43,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "inline-flex items-center gap-1",
                title: `Wind: ${windKmh} km/h ${compassDir} (${weather.wind_direction}°)`,
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_4["default"], {
                        size: 16
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, undefined),
                    " ",
                    windKmh,
                    " km/h",
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_5["default"], {
                        size: 14,
                        style: {
                            transform: `rotate(${(weather.wind_direction + 180) % 360}deg)`
                        }
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, undefined),
                    compassDir
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "text-white/20",
                children: "|"
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                className: "inline-flex items-center gap-1",
                title: "Humidity",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_6["default"], {
                        size: 16
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                        lineNumber: 57,
                        columnNumber: 9
                    }, undefined),
                    " ",
                    weather.humidity,
                    "%"
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
                lineNumber: 56,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/components/WeatherBadge.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, undefined);
};
_c = WeatherBadge;
var _c;
$RefreshReg$(_c, "WeatherBadge");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/constants/replay.constants.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  ALLOWED_SESSION_TYPES: () => (ALLOWED_SESSION_TYPES),
  SKIP_INTERVAL_LABELS: () => (SKIP_INTERVAL_LABELS),
  SKIP_INTERVAL_OPTIONS: () => (SKIP_INTERVAL_OPTIONS),
  SPEED_OPTIONS: () => (SPEED_OPTIONS),
  TRACK_POINT_QUANTIZE: () => (TRACK_POINT_QUANTIZE),
  TRACK_TIME_GAP_MS: () => (TRACK_TIME_GAP_MS),
  getDefaultYear: () => (getDefaultYear)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const ALLOWED_SESSION_TYPES = [
    "Race",
    "Sprint",
    "Qualifying"
];
const TRACK_TIME_GAP_MS = 2000;
const TRACK_POINT_QUANTIZE = 5;
const SPEED_OPTIONS = [
    0.5,
    1,
    2,
    4
];
const SKIP_INTERVAL_OPTIONS = [
    10000,
    30000,
    60000,
    300000
];
const SKIP_INTERVAL_LABELS = {
    10000: "10s",
    30000: "30s",
    60000: "1m",
    300000: "5m"
};
const getDefaultYear = ()=>new Date().getFullYear() - 1;

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useKeyboardShortcuts.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useKeyboardShortcuts: () => (useKeyboardShortcuts)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

const IGNORED_TAG_NAMES = new Set([
    "INPUT",
    "TEXTAREA",
    "SELECT"
]);
const useKeyboardShortcuts = (actions)=>{
    const actionsRef = (0,react__rspack_import_0.useRef)(actions);
    actionsRef.current = actions;
    (0,react__rspack_import_0.useEffect)(()=>{
        const handler = (e)=>{
            const target = e.target;
            if (target && IGNORED_TAG_NAMES.has(target.tagName)) return;
            const a = actionsRef.current;
            switch(e.key){
                case " ":
                    e.preventDefault();
                    a.togglePlay();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    a.seekTo(a.currentTimeMs - a.skipIntervalMs);
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    a.seekTo(a.currentTimeMs + a.skipIntervalMs);
                    break;
                case "s":
                case "S":
                    a.cycleSpeed();
                    break;
                case "m":
                case "M":
                    a.toggleRadio();
                    break;
                case "i":
                case "I":
                    a.cycleSkipInterval();
                    break;
                case "e":
                case "E":
                    a.toggleTimelineExpanded();
                    break;
            }
        };
        document.addEventListener("keydown", handler);
        return ()=>document.removeEventListener("keydown", handler);
    }, []);
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useReplayController.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useReplayController: () => (useReplayController)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

const useReplayController = (param)=>{
    let { startTimeMs, endTimeMs, availableEndMs } = param;
    const [currentTimeMs, setCurrentTimeMs] = (0,react__rspack_import_0.useState)(startTimeMs);
    const [isPlaying, setIsPlaying] = (0,react__rspack_import_0.useState)(false);
    const [isBuffering, setIsBuffering] = (0,react__rspack_import_0.useState)(false);
    const [speed, setSpeed] = (0,react__rspack_import_0.useState)(1);
    const lastFrameRef = (0,react__rspack_import_0.useRef)(null);
    const rafRef = (0,react__rspack_import_0.useRef)(null);
    const speedRef = (0,react__rspack_import_0.useRef)(speed);
    speedRef.current = speed;
    const endTimeMsRef = (0,react__rspack_import_0.useRef)(endTimeMs);
    endTimeMsRef.current = endTimeMs;
    const availableEndMsRef = (0,react__rspack_import_0.useRef)(availableEndMs);
    availableEndMsRef.current = availableEndMs;
    const stop = (0,react__rspack_import_0.useCallback)(()=>{
        setIsPlaying(false);
        setIsBuffering(false);
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);
    const tick = (0,react__rspack_import_0.useCallback)((timestamp)=>{
        if (!lastFrameRef.current) {
            lastFrameRef.current = timestamp;
            rafRef.current = requestAnimationFrame(tick);
            return;
        }
        const delta = timestamp - lastFrameRef.current;
        lastFrameRef.current = timestamp;
        setCurrentTimeMs((prev)=>{
            const next = prev + delta * speedRef.current;
            if (next >= endTimeMsRef.current) {
                stop();
                return endTimeMsRef.current;
            }
            if (next >= availableEndMsRef.current) {
                setIsBuffering(true);
                setIsPlaying(false);
                return availableEndMsRef.current;
            }
            return next;
        });
        rafRef.current = requestAnimationFrame(tick);
    }, [
        stop
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (!isPlaying) {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            lastFrameRef.current = null;
            return;
        }
        rafRef.current = requestAnimationFrame(tick);
        return ()=>{
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = null;
            lastFrameRef.current = null;
        };
    }, [
        isPlaying,
        tick
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (isBuffering && currentTimeMs < availableEndMs - 1000) {
            setIsBuffering(false);
            setIsPlaying(true);
        }
    }, [
        availableEndMs,
        currentTimeMs,
        isBuffering
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        setCurrentTimeMs(startTimeMs);
        stop();
    }, [
        startTimeMs,
        stop
    ]);
    const togglePlay = ()=>{
        setIsPlaying((prev)=>!prev);
        setIsBuffering(false);
    };
    const seekTo = (timestampMs)=>{
        const clamped = Math.min(Math.max(timestampMs, startTimeMs), endTimeMs);
        setCurrentTimeMs(clamped);
    };
    return {
        currentTimeMs,
        isPlaying,
        isBuffering,
        speed,
        setSpeed,
        togglePlay,
        seekTo
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useReplayData.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useReplayData: () => (useReplayData)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* import */ var _api_openf1_client__rspack_import_1 = __webpack_require__("./src/modules/replay/api/openf1.client.ts");
/* import */ var _services_telemetry_service__rspack_import_2 = __webpack_require__("./src/modules/replay/services/telemetry.service.ts");
/* import */ var _utils_telemetry_util__rspack_import_3 = __webpack_require__("./src/modules/replay/utils/telemetry.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");




const useReplayData = (param)=>{
    let { year, round, sessionType } = param;
    const [data, setData] = (0,react__rspack_import_0.useState)(null);
    const [loading, setLoading] = (0,react__rspack_import_0.useState)(false);
    const [error, setError] = (0,react__rspack_import_0.useState)(null);
    const [meetings, setMeetings] = (0,react__rspack_import_0.useState)([]);
    const [sessions, setSessions] = (0,react__rspack_import_0.useState)([]);
    const [availableYears, setAvailableYears] = (0,react__rspack_import_0.useState)([]);
    const [availableEndMs, setAvailableEndMs] = (0,react__rspack_import_0.useState)(0);
    const [dataRevision, setDataRevision] = (0,react__rspack_import_0.useState)(0);
    const sessionCacheRef = (0,react__rspack_import_0.useRef)(new Map());
    const abortRef = (0,react__rspack_import_0.useRef)(null);
    const meetingsRequestRef = (0,react__rspack_import_0.useRef)(0);
    const sessionsRequestRef = (0,react__rspack_import_0.useRef)(0);
    const yearOptions = (0,react__rspack_import_0.useMemo)(()=>(0,_services_telemetry_service__rspack_import_2.buildYearOptions)(new Date().getFullYear()), []);
    const sortedMeetings = (0,react__rspack_import_0.useMemo)(()=>{
        return [
            ...meetings
        ].sort((a, b)=>new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    }, [
        meetings
    ]);
    const selectedMeeting = sortedMeetings[round - 1] ?? sortedMeetings[0] ?? null;
    const selectedMeetingKey = (selectedMeeting === null || selectedMeeting === void 0 ? void 0 : selectedMeeting.meeting_key) ?? null;
    const selectedMeetingRef = (0,react__rspack_import_0.useRef)(selectedMeeting);
    selectedMeetingRef.current = selectedMeeting;
    (0,react__rspack_import_0.useEffect)(()=>{
        const requestId = meetingsRequestRef.current + 1;
        meetingsRequestRef.current = requestId;
        setLoading(true);
        setError(null);
        setMeetings([]);
        setSessions([]);
        setData(null);
        setAvailableEndMs(0);
        setDataRevision(0);
        (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("meetings", {
            year
        }, undefined, "persist").then((result)=>{
            if (meetingsRequestRef.current !== requestId) {
                return;
            }
            setMeetings((0,_services_telemetry_service__rspack_import_2.filterEndedMeetings)(result, Date.now()));
        }).catch((err)=>{
            if (meetingsRequestRef.current !== requestId) {
                return;
            }
            setError(err.message);
        }).finally(()=>{
            if (meetingsRequestRef.current === requestId) {
                setLoading(false);
            }
        });
    }, [
        year
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        let cancelled = false;
        const loadYears = async ()=>{
            const now = Date.now();
            const available = [];
            for (const option of yearOptions){
                try {
                    const result = await (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("meetings", {
                        year: option
                    }, undefined, "persist");
                    if (cancelled) {
                        return;
                    }
                    if ((0,_services_telemetry_service__rspack_import_2.filterEndedMeetings)(result, now).length > 0) {
                        available.push(option);
                    }
                } catch  {
                    if (cancelled) {
                        return;
                    }
                }
            }
            if (!cancelled) {
                setAvailableYears(available);
            }
        };
        void loadYears();
        return ()=>{
            cancelled = true;
        };
    }, [
        yearOptions
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (!selectedMeetingKey) {
            return;
        }
        const requestId = sessionsRequestRef.current + 1;
        sessionsRequestRef.current = requestId;
        setLoading(true);
        setError(null);
        setSessions([]);
        setData(null);
        setAvailableEndMs(0);
        setDataRevision(0);
        (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("sessions", {
            meeting_key: selectedMeetingKey
        }, undefined, "persist").then((result)=>{
            if (sessionsRequestRef.current !== requestId) {
                return;
            }
            const now = Date.now();
            const filtered = result.filter((session)=>{
                const endMs = new Date(session.date_end).getTime();
                return endMs <= now;
            });
            setSessions(filtered);
        }).catch((err)=>{
            if (sessionsRequestRef.current !== requestId) {
                return;
            }
            setError(err.message);
        }).finally(()=>{
            if (sessionsRequestRef.current === requestId) {
                setLoading(false);
            }
        });
    }, [
        selectedMeetingKey
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        var _abortRef_current;
        const meeting = selectedMeetingRef.current;
        if (!meeting) {
            return;
        }
        const session = sessions.find((entry)=>entry.session_type === sessionType) ?? null;
        if (!session) {
            setLoading(false);
            setData(null);
            return;
        }
        const cached = sessionCacheRef.current.get(session.session_key);
        if (cached) {
            setData(cached);
            setAvailableEndMs((0,_services_telemetry_service__rspack_import_2.getLatestTelemetryTimestamp)(cached.telemetryByDriver));
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        (_abortRef_current = abortRef.current) === null || _abortRef_current === void 0 ? void 0 : _abortRef_current.abort();
        abortRef.current = controller;
        setLoading(true);
        setError(null);
        setData(null);
        setAvailableEndMs(0);
        setDataRevision(0);
        const load = async ()=>{
            const cached = await (0,_api_openf1_client__rspack_import_1.fetchReplayFromWorker)(session.session_key, controller.signal);
            if (cached.status === "hit") {
                sessionCacheRef.current.set(session.session_key, cached.payload);
                const latest = (0,_services_telemetry_service__rspack_import_2.getLatestTelemetryTimestamp)(cached.payload.telemetryByDriver);
                if (!controller.signal.aborted) {
                    setAvailableEndMs(latest > 0 ? latest : cached.payload.sessionEndMs);
                }
                return cached.payload;
            }
            const drivers = await (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("drivers", {
                session_key: session.session_key
            }, controller.signal, "persist");
            const telemetryByDriver = (0,_services_telemetry_service__rspack_import_2.createTelemetryMap)(drivers);
            const sessionStartMs = new Date(session.date_start).getTime();
            const sessionEndMs = new Date(session.date_end).getTime();
            const [stints, laps, teamRadios, overtakes, weather, raceControl, pits] = await Promise.all([
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("stints", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("laps", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("team_radio", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("overtakes", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("weather", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("race_control", {
                    session_key: session.session_key
                }, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchOpenF1)("pit", {
                    session_key: session.session_key
                }, controller.signal, "persist")
            ]);
            const lapsTimed = (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(laps);
            const lapsGrouped = (0,_utils_telemetry_util__rspack_import_3.groupByDriverNumber)(lapsTimed);
            Object.entries(lapsGrouped).forEach((param)=>{
                let [driverKey, driverLaps] = param;
                const driverNumber = Number(driverKey);
                if (!telemetryByDriver[driverNumber]) {
                    telemetryByDriver[driverNumber] = {
                        locations: [],
                        positions: [],
                        stints: [],
                        laps: []
                    };
                }
                telemetryByDriver[driverNumber].laps = (0,_utils_telemetry_util__rspack_import_3.sortByTimestamp)(driverLaps);
            });
            const stintsGrouped = (0,_utils_telemetry_util__rspack_import_3.groupByDriverNumber)(stints);
            Object.entries(stintsGrouped).forEach((param)=>{
                let [driverKey, driverStints] = param;
                const driverNumber = Number(driverKey);
                if (!telemetryByDriver[driverNumber]) {
                    telemetryByDriver[driverNumber] = {
                        locations: [],
                        positions: [],
                        stints: [],
                        laps: []
                    };
                }
                telemetryByDriver[driverNumber].stints = driverStints;
            });
            const baseData = {
                meeting: meeting,
                session,
                drivers,
                telemetryByDriver,
                sessionStartMs,
                sessionEndMs,
                teamRadios: (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(teamRadios),
                overtakes: (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(overtakes),
                weather: (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(weather),
                raceControl: (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(raceControl),
                pits: (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(pits)
            };
            if (!controller.signal.aborted) {
                setData(baseData);
            }
            const handleLocationsChunk = (chunk)=>{
                const normalized = (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(chunk);
                (0,_services_telemetry_service__rspack_import_2.chunkAppend)(Object.fromEntries(Object.keys(telemetryByDriver).map((key)=>[
                        Number(key),
                        telemetryByDriver[Number(key)].locations
                    ])), normalized);
                const latestTimestamp = normalized.reduce((max, sample)=>Math.max(max, sample.timestampMs), 0);
                if (latestTimestamp > 0) {
                    setAvailableEndMs((prev)=>Math.max(prev, latestTimestamp));
                }
                setDataRevision((prev)=>prev + 1);
            };
            const handlePositionChunk = (chunk)=>{
                const normalized = (0,_utils_telemetry_util__rspack_import_3.withTimestamp)(chunk);
                (0,_services_telemetry_service__rspack_import_2.chunkAppend)(Object.fromEntries(Object.keys(telemetryByDriver).map((key)=>[
                        Number(key),
                        telemetryByDriver[Number(key)].positions
                    ])), normalized);
                setDataRevision((prev)=>prev + 1);
            };
            const positionStartMs = Math.max(0, sessionStartMs - 60 * 60 * 1000);
            await Promise.all([
                (0,_api_openf1_client__rspack_import_1.fetchChunked)("location", {
                    session_key: session.session_key
                }, sessionStartMs, sessionEndMs, 180000, handleLocationsChunk, controller.signal, "persist"),
                (0,_api_openf1_client__rspack_import_1.fetchChunked)("position", {
                    session_key: session.session_key
                }, positionStartMs, sessionEndMs, 600000, handlePositionChunk, controller.signal, "persist")
            ]);
            Object.values(telemetryByDriver).forEach((telemetry)=>{
                telemetry.locations = (0,_utils_telemetry_util__rspack_import_3.sortByTimestamp)(telemetry.locations);
                telemetry.positions = (0,_utils_telemetry_util__rspack_import_3.sortByTimestamp)(telemetry.positions);
            });
            sessionCacheRef.current.set(session.session_key, baseData);
            if (!controller.signal.aborted) {
                void (0,_api_openf1_client__rspack_import_1.uploadReplayToWorker)(session.session_key, baseData, cached.uploadToken, controller.signal).catch(()=>undefined);
            }
            return baseData;
        };
        load().then((result)=>{
            if (!controller.signal.aborted) {
                setData(result);
            }
        }).catch((err)=>{
            if (controller.signal.aborted) {
                return;
            }
            setError(err.message);
        }).finally(()=>{
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        });
        return ()=>{
            controller.abort();
        };
    }, [
        sessions,
        sessionType
    ]);
    return {
        data,
        loading,
        error,
        meetings: sortedMeetings,
        sessions,
        availableYears,
        availableEndMs,
        dataRevision
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useSessionSelector.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useSessionAutoCorrect: () => (useSessionAutoCorrect),
  useSessionState: () => (useSessionState)
});
/* import */ var _tanstack_react_router__rspack_import_2 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/useSearch.js");
/* import */ var _tanstack_react_router__rspack_import_3 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/useNavigate.js");
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* import */ var _constants_replay_constants__rspack_import_1 = __webpack_require__("./src/modules/replay/constants/replay.constants.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");



const useSessionAutoCorrect = (param)=>{
    let { meetings, sessions, availableYears, year, round, sessionType, setYear, setRound, setSessionType, manualRoundRef } = param;
    const hasSupportedSession = (0,react__rspack_import_0.useMemo)(()=>{
        return sessions.some((session)=>_constants_replay_constants__rspack_import_1.ALLOWED_SESSION_TYPES.includes(session.session_type));
    }, [
        sessions
    ]);
    const hasSelectedSession = (0,react__rspack_import_0.useMemo)(()=>{
        return sessions.some((session)=>session.session_type === sessionType);
    }, [
        sessions,
        sessionType
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (sessions.length === 0 || hasSelectedSession) {
            return;
        }
        const fallback = sessions.find((session)=>_constants_replay_constants__rspack_import_1.ALLOWED_SESSION_TYPES.includes(session.session_type));
        if (fallback) {
            setSessionType(fallback.session_type);
        }
    }, [
        sessions,
        hasSelectedSession,
        setSessionType
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (availableYears.length === 0) {
            return;
        }
        if (!availableYears.includes(year)) {
            const nextYear = availableYears[0];
            if (nextYear !== year) {
                setYear(nextYear);
                setRound(1);
                manualRoundRef.current = false;
            }
        }
    }, [
        availableYears,
        year,
        setYear,
        setRound,
        manualRoundRef
    ]);
    (0,react__rspack_import_0.useEffect)(()=>{
        if (manualRoundRef.current) {
            return;
        }
        if (sessions.length === 0 || hasSupportedSession) {
            return;
        }
        if (round < meetings.length) {
            setRound((prev)=>Math.min(prev + 1, meetings.length));
        }
    }, [
        sessions,
        hasSupportedSession,
        meetings.length,
        round,
        setRound,
        manualRoundRef
    ]);
    return {
        hasSupportedSession,
        hasSelectedSession
    };
};
const isValidSessionType = (value)=>value === "Race" || value === "Sprint" || value === "Qualifying";
const useSessionState = ()=>{
    const search = (0,_tanstack_react_router__rspack_import_2.useSearch)({
        from: "/replay"
    });
    const navigate = (0,_tanstack_react_router__rspack_import_3.useNavigate)();
    const manualRoundRef = (0,react__rspack_import_0.useRef)(false);
    const defaultYear = (0,_constants_replay_constants__rspack_import_1.getDefaultYear)();
    const year = typeof search.year === "number" ? search.year : defaultYear;
    const round = typeof search.round === "number" ? search.round : 1;
    const sessionType = isValidSessionType(search.session) ? search.session : "Race";
    const setYear = (0,react__rspack_import_0.useCallback)((nextYear)=>{
        navigate({
            to: "/replay",
            search: (prev)=>({
                    ...prev,
                    year: nextYear,
                    round: 1
                }),
            replace: true
        });
    }, [
        navigate
    ]);
    const setRound = (0,react__rspack_import_0.useCallback)((nextRound)=>{
        navigate({
            to: "/replay",
            search: (prev)=>{
                const resolved = typeof nextRound === "function" ? nextRound(typeof prev.round === "number" ? prev.round : 1) : nextRound;
                return {
                    ...prev,
                    round: resolved
                };
            },
            replace: true
        });
    }, [
        navigate
    ]);
    const setSessionType = (0,react__rspack_import_0.useCallback)((nextSessionType)=>{
        navigate({
            to: "/replay",
            search: (prev)=>({
                    ...prev,
                    session: nextSessionType
                }),
            replace: true
        });
    }, [
        navigate
    ]);
    return {
        year,
        round,
        sessionType,
        manualRoundRef,
        setYear,
        setRound,
        setSessionType
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useTeamRadio.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useTeamRadio: () => (useTeamRadio)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

const useTeamRadio = ()=>{
    const [currentRadio, setCurrentRadio] = (0,react__rspack_import_0.useState)(null);
    const [isAudioPlaying, setIsAudioPlaying] = (0,react__rspack_import_0.useState)(false);
    const [playbackError, setPlaybackError] = (0,react__rspack_import_0.useState)(false);
    const audioRef = (0,react__rspack_import_0.useRef)(null);
    const stopRadio = (0,react__rspack_import_0.useCallback)(()=>{
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            audioRef.current = null;
        }
        setCurrentRadio(null);
        setIsAudioPlaying(false);
        setPlaybackError(false);
    }, []);
    const playRadio = (0,react__rspack_import_0.useCallback)((radio)=>{
        stopRadio();
        const audio = new Audio(radio.recording_url);
        audioRef.current = audio;
        setCurrentRadio(radio);
        setPlaybackError(false);
        audio.onended = ()=>{
            setCurrentRadio(null);
            setIsAudioPlaying(false);
            audioRef.current = null;
        };
        audio.onerror = ()=>{
            setPlaybackError(true);
            setIsAudioPlaying(false);
        };
        audio.play().then(()=>setIsAudioPlaying(true)).catch(()=>{
            setPlaybackError(true);
            setIsAudioPlaying(false);
        });
    }, [
        stopRadio
    ]);
    const pauseRadio = (0,react__rspack_import_0.useCallback)(()=>{
        if (audioRef.current && isAudioPlaying) {
            audioRef.current.pause();
            setIsAudioPlaying(false);
        }
    }, [
        isAudioPlaying
    ]);
    const resumeRadio = (0,react__rspack_import_0.useCallback)(()=>{
        if (audioRef.current && !isAudioPlaying && currentRadio) {
            audioRef.current.play().then(()=>setIsAudioPlaying(true)).catch(()=>{
                setPlaybackError(true);
                setIsAudioPlaying(false);
            });
        }
    }, [
        isAudioPlaying,
        currentRadio
    ]);
    return {
        currentRadio,
        isAudioPlaying,
        playRadio,
        stopRadio,
        pauseRadio,
        resumeRadio,
        playbackError
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useTrackComputation.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useTrackComputation: () => (useTrackComputation)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* import */ var _services_driverState_service__rspack_import_1 = __webpack_require__("./src/modules/replay/services/driverState.service.ts");
/* import */ var _services_trackBuilder_service__rspack_import_2 = __webpack_require__("./src/modules/replay/services/trackBuilder.service.ts");
/* import */ var _utils_telemetry_util__rspack_import_3 = __webpack_require__("./src/modules/replay/utils/telemetry.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");




const useTrackComputation = (param)=>{
    let { data, dataRevision, currentTimeMs } = param;
    // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
    const referencePositions = (0,react__rspack_import_0.useMemo)(()=>{
        if (!(data === null || data === void 0 ? void 0 : data.drivers.length)) {
            return [];
        }
        return (0,_services_trackBuilder_service__rspack_import_2.buildReferencePositions)(data);
    }, [
        data,
        dataRevision
    ]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
    const normalization = (0,react__rspack_import_0.useMemo)(()=>{
        const positions = referencePositions.map((sample)=>({
                x: sample.x,
                y: sample.y,
                z: sample.z
            }));
        return (0,_utils_telemetry_util__rspack_import_3.normalizePositions)(positions);
    }, [
        referencePositions,
        dataRevision
    ]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: dataRevision triggers recomputation when mutated arrays change
    const driverStates = (0,react__rspack_import_0.useMemo)(()=>{
        if (!data) {
            return {};
        }
        return (0,_services_driverState_service__rspack_import_1.computeDriverStates)(data, currentTimeMs, normalization);
    }, [
        data,
        dataRevision,
        normalization,
        currentTimeMs
    ]);
    const trackPath = (0,react__rspack_import_0.useMemo)(()=>{
        return (0,_services_trackBuilder_service__rspack_import_2.buildTrackPath)(referencePositions, normalization);
    }, [
        normalization,
        referencePositions
    ]);
    const driverNames = (0,react__rspack_import_0.useMemo)(()=>{
        if (!data) {
            return {};
        }
        return (0,_services_driverState_service__rspack_import_1.buildDriverNames)(data.drivers);
    }, [
        data
    ]);
    return {
        trackPath,
        driverStates,
        driverNames
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/hooks/useUserPreferences.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  useUserPreferences: () => (useUserPreferences)
});
/* import */ var react__rspack_import_0 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_0_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_0);
/* import */ var _constants_replay_constants__rspack_import_1 = __webpack_require__("./src/modules/replay/constants/replay.constants.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const STORAGE_KEY = "f1-replay-prefs";
const DEFAULTS = {
    speed: 1,
    skipIntervalMs: 10000,
    radioEnabled: true,
    timelineExpanded: false
};
const loadPrefs = ()=>{
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULTS,
            ...parsed
        };
    } catch  {
        return DEFAULTS;
    }
};
const persistPrefs = (prefs)=>{
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch  {
    // localStorage may be unavailable in some environments
    }
};
const useUserPreferences = ()=>{
    const [prefs, setPrefs] = (0,react__rspack_import_0.useState)(loadPrefs);
    const prefsRef = (0,react__rspack_import_0.useRef)(prefs);
    prefsRef.current = prefs;
    const update = (0,react__rspack_import_0.useCallback)((patch)=>{
        setPrefs((prev)=>{
            const next = {
                ...prev,
                ...patch
            };
            prefsRef.current = next;
            persistPrefs(next);
            return next;
        });
    }, []);
    const setSpeed = (0,react__rspack_import_0.useCallback)((speed)=>update({
            speed
        }), [
        update
    ]);
    const cycleSpeed = (0,react__rspack_import_0.useCallback)(()=>{
        const currentIndex = _constants_replay_constants__rspack_import_1.SPEED_OPTIONS.indexOf(prefsRef.current.speed);
        const nextIndex = (currentIndex + 1) % _constants_replay_constants__rspack_import_1.SPEED_OPTIONS.length;
        update({
            speed: _constants_replay_constants__rspack_import_1.SPEED_OPTIONS[nextIndex]
        });
    }, [
        update
    ]);
    const setSkipIntervalMs = (0,react__rspack_import_0.useCallback)((skipIntervalMs)=>update({
            skipIntervalMs
        }), [
        update
    ]);
    const cycleSkipInterval = (0,react__rspack_import_0.useCallback)(()=>{
        const options = _constants_replay_constants__rspack_import_1.SKIP_INTERVAL_OPTIONS;
        const currentIndex = options.indexOf(prefsRef.current.skipIntervalMs);
        const nextIndex = (currentIndex + 1) % options.length;
        update({
            skipIntervalMs: options[nextIndex]
        });
    }, [
        update
    ]);
    const toggleRadio = (0,react__rspack_import_0.useCallback)(()=>update({
            radioEnabled: !prefsRef.current.radioEnabled
        }), [
        update
    ]);
    const toggleTimelineExpanded = (0,react__rspack_import_0.useCallback)(()=>update({
            timelineExpanded: !prefsRef.current.timelineExpanded
        }), [
        update
    ]);
    return {
        speed: prefs.speed,
        skipIntervalMs: prefs.skipIntervalMs,
        radioEnabled: prefs.radioEnabled,
        timelineExpanded: prefs.timelineExpanded,
        setSpeed,
        cycleSpeed,
        setSkipIntervalMs,
        cycleSkipInterval,
        toggleRadio,
        toggleTimelineExpanded
    };
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/index.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  ReplayPage: () => (/* reexport safe */ _pages_ReplayPage__rspack_import_0.ReplayPage)
});
/* import */ var _pages_ReplayPage__rspack_import_0 = __webpack_require__("./src/modules/replay/pages/ReplayPage.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/pages/ReplayPage.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  ReplayPage: () => (ReplayPage)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var lucide_react__rspack_import_19 = __webpack_require__("./node_modules/lucide-react/dist/esm/icons/loader-circle.js");
/* import */ var react__rspack_import_1 = __webpack_require__("./node_modules/react/index.js");
/* import */ var react__rspack_import_1_default = /*#__PURE__*/__webpack_require__.n(react__rspack_import_1);
/* import */ var _components_ControlsBar__rspack_import_2 = __webpack_require__("./src/modules/replay/components/ControlsBar.tsx");
/* import */ var _components_MarkerLegend__rspack_import_3 = __webpack_require__("./src/modules/replay/components/MarkerLegend.tsx");
/* import */ var _components_SessionPicker__rspack_import_4 = __webpack_require__("./src/modules/replay/components/SessionPicker.tsx");
/* import */ var _components_TelemetryPanel__rspack_import_5 = __webpack_require__("./src/modules/replay/components/TelemetryPanel.tsx");
/* import */ var _components_TrackView__rspack_import_6 = __webpack_require__("./src/modules/replay/components/TrackView.tsx");
/* import */ var _components_WeatherBadge__rspack_import_7 = __webpack_require__("./src/modules/replay/components/WeatherBadge.tsx");
/* import */ var _constants_replay_constants__rspack_import_8 = __webpack_require__("./src/modules/replay/constants/replay.constants.ts");
/* import */ var _hooks_useKeyboardShortcuts__rspack_import_9 = __webpack_require__("./src/modules/replay/hooks/useKeyboardShortcuts.ts");
/* import */ var _hooks_useReplayController__rspack_import_10 = __webpack_require__("./src/modules/replay/hooks/useReplayController.ts");
/* import */ var _hooks_useReplayData__rspack_import_11 = __webpack_require__("./src/modules/replay/hooks/useReplayData.ts");
/* import */ var _hooks_useSessionSelector__rspack_import_12 = __webpack_require__("./src/modules/replay/hooks/useSessionSelector.ts");
/* import */ var _hooks_useTeamRadio__rspack_import_13 = __webpack_require__("./src/modules/replay/hooks/useTeamRadio.ts");
/* import */ var _hooks_useTrackComputation__rspack_import_14 = __webpack_require__("./src/modules/replay/hooks/useTrackComputation.ts");
/* import */ var _hooks_useUserPreferences__rspack_import_15 = __webpack_require__("./src/modules/replay/hooks/useUserPreferences.ts");
/* import */ var _services_events_service__rspack_import_16 = __webpack_require__("./src/modules/replay/services/events.service.ts");
/* import */ var _services_telemetry_service__rspack_import_17 = __webpack_require__("./src/modules/replay/services/telemetry.service.ts");
/* import */ var _services_weather_service__rspack_import_18 = __webpack_require__("./src/modules/replay/services/weather.service.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

var _s = $RefreshSig$();



















const ReplayPage = ()=>{
    _s();
    const session = (0,_hooks_useSessionSelector__rspack_import_12.useSessionState)();
    const prefs = (0,_hooks_useUserPreferences__rspack_import_15.useUserPreferences)();
    const { data, loading, error, meetings, sessions, availableYears, availableEndMs, dataRevision } = (0,_hooks_useReplayData__rspack_import_11.useReplayData)({
        year: session.year,
        round: session.round,
        sessionType: session.sessionType
    });
    const { hasSupportedSession } = (0,_hooks_useSessionSelector__rspack_import_12.useSessionAutoCorrect)({
        meetings,
        sessions,
        availableYears,
        year: session.year,
        round: session.round,
        sessionType: session.sessionType,
        setYear: session.setYear,
        setRound: session.setRound,
        setSessionType: session.setSessionType,
        manualRoundRef: session.manualRoundRef
    });
    const sessionStartMs = (data === null || data === void 0 ? void 0 : data.sessionStartMs) ?? 0;
    const sessionEndMs = (data === null || data === void 0 ? void 0 : data.sessionEndMs) ?? 0;
    const effectiveEndMs = availableEndMs > sessionStartMs ? availableEndMs : Math.max(sessionEndMs, sessionStartMs);
    const canPlay = Boolean(data) && effectiveEndMs > sessionStartMs && availableEndMs > sessionStartMs;
    const replay = (0,_hooks_useReplayController__rspack_import_10.useReplayController)({
        startTimeMs: sessionStartMs,
        endTimeMs: effectiveEndMs,
        availableEndMs: availableEndMs || sessionStartMs
    });
    // Sync persisted speed to replay controller
    // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when speed preference changes
    (0,react__rspack_import_1.useEffect)(()=>{
        replay.setSpeed(prefs.speed);
    }, [
        prefs.speed
    ]);
    const { trackPath, driverStates, driverNames } = (0,_hooks_useTrackComputation__rspack_import_14.useTrackComputation)({
        data,
        dataRevision,
        currentTimeMs: replay.currentTimeMs
    });
    const telemetrySummary = (0,react__rspack_import_1.useMemo)(()=>(0,_services_telemetry_service__rspack_import_17.computeTelemetrySummary)(data, availableEndMs, effectiveEndMs, sessionStartMs), [
        data,
        availableEndMs,
        effectiveEndMs,
        sessionStartMs
    ]);
    const telemetryRows = (0,react__rspack_import_1.useMemo)(()=>(0,_services_telemetry_service__rspack_import_17.computeTelemetryRows)(data, replay.currentTimeMs), [
        data,
        replay.currentTimeMs
    ]);
    const timelineEvents = (0,react__rspack_import_1.useMemo)(()=>{
        if (!data) return [];
        return (0,_services_events_service__rspack_import_16.buildTimelineEvents)(data, data.drivers);
    }, [
        data
    ]);
    const currentWeather = (0,react__rspack_import_1.useMemo)(()=>{
        if (!data) return null;
        return (0,_services_weather_service__rspack_import_18.getWeatherAtTime)(data.weather, replay.currentTimeMs);
    }, [
        data,
        replay.currentTimeMs
    ]);
    const activeOvertakes = (0,react__rspack_import_1.useMemo)(()=>{
        if (!data) return [];
        return (0,_services_events_service__rspack_import_16.getActiveOvertakes)(data.overtakes, replay.currentTimeMs);
    }, [
        data,
        replay.currentTimeMs
    ]);
    const { isAudioPlaying, playRadio, stopRadio, pauseRadio, resumeRadio } = (0,_hooks_useTeamRadio__rspack_import_13.useTeamRadio)();
    const handleMarkerClick = (0,react__rspack_import_1.useCallback)((timestampMs)=>{
        replay.seekTo(timestampMs);
        if (!replay.isPlaying) {
            replay.togglePlay();
        }
    }, [
        replay
    ]);
    const handleSkipBack = (0,react__rspack_import_1.useCallback)(()=>replay.seekTo(replay.currentTimeMs - prefs.skipIntervalMs), [
        replay,
        prefs.skipIntervalMs
    ]);
    const handleSkipForward = (0,react__rspack_import_1.useCallback)(()=>replay.seekTo(replay.currentTimeMs + prefs.skipIntervalMs), [
        replay,
        prefs.skipIntervalMs
    ]);
    // Collapsible UI state (lightweight, not persisted)
    const [legendCollapsed, setLegendCollapsed] = (0,react__rspack_import_1.useState)(true);
    const [shortcutsCollapsed, setShortcutsCollapsed] = (0,react__rspack_import_1.useState)(true);
    const toggleLegendCollapsed = (0,react__rspack_import_1.useCallback)(()=>setLegendCollapsed((prev)=>!prev), []);
    const toggleShortcutsCollapsed = (0,react__rspack_import_1.useCallback)(()=>setShortcutsCollapsed((prev)=>!prev), []);
    // Keyboard shortcuts
    (0,_hooks_useKeyboardShortcuts__rspack_import_9.useKeyboardShortcuts)({
        togglePlay: replay.togglePlay,
        seekTo: replay.seekTo,
        currentTimeMs: replay.currentTimeMs,
        skipIntervalMs: prefs.skipIntervalMs,
        cycleSpeed: prefs.cycleSpeed,
        toggleRadio: prefs.toggleRadio,
        cycleSkipInterval: prefs.cycleSkipInterval,
        toggleTimelineExpanded: prefs.toggleTimelineExpanded
    });
    const skipIntervalLabel = _constants_replay_constants__rspack_import_8.SKIP_INTERVAL_LABELS[prefs.skipIntervalMs] ?? `${prefs.skipIntervalMs / 1000}s`;
    const drivers = (data === null || data === void 0 ? void 0 : data.drivers) ?? [];
    return /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
        className: "relative min-h-screen w-full overflow-y-auto text-white md:h-screen md:w-screen md:overflow-hidden",
        children: [
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "pointer-events-none absolute inset-0 z-0 opacity-55 mix-blend-overlay",
                style: {
                    backgroundImage: "url('/noise.svg')",
                    backgroundRepeat: "repeat",
                    backgroundSize: "256px 256px",
                    filter: "contrast(200%) brightness(400%)"
                }
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 144,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("header", {
                className: "relative z-10 mx-4 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 backdrop-blur-xl md:absolute md:left-4 md:right-80 md:top-4 md:mx-0 md:mt-0",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("h1", {
                                className: "text-lg font-semibold",
                                children: "F1 Replay"
                            }, void 0, false, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                                lineNumber: 155,
                                columnNumber: 11
                            }, undefined),
                            loading && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("span", {
                                className: "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300",
                                children: [
                                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(lucide_react__rspack_import_19["default"], {
                                        size: 14,
                                        className: "animate-spin"
                                    }, void 0, false, {
                                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                                        lineNumber: 158,
                                        columnNumber: 15
                                    }, undefined),
                                    "Loading telemetry data…"
                                ]
                            }, void 0, true, {
                                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                                lineNumber: 157,
                                columnNumber: 13
                            }, undefined)
                        ]
                    }, void 0, true, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 154,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_WeatherBadge__rspack_import_7.WeatherBadge, {
                        weather: currentWeather
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 163,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_SessionPicker__rspack_import_4.SessionPicker, {
                        year: session.year,
                        round: session.round,
                        sessionType: session.sessionType,
                        meetings: meetings,
                        sessions: sessions,
                        yearOptions: availableYears,
                        onYearChange: (nextYear)=>{
                            session.setYear(nextYear);
                            session.setRound(1);
                            session.manualRoundRef.current = false;
                        },
                        onRoundChange: (nextRound)=>{
                            session.manualRoundRef.current = true;
                            session.setRound(nextRound);
                        },
                        onSessionTypeChange: session.setSessionType
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 164,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 153,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "relative z-10 mx-4 mt-3 flex max-w-[420px] flex-col gap-2 md:absolute md:left-4 md:top-24 md:mx-0 md:mt-0",
                children: [
                    error && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200",
                        children: error
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 186,
                        columnNumber: 11
                    }, undefined),
                    !hasSupportedSession && sessions.length > 0 && /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200",
                        children: "No supported session types (Race, Sprint, Qualifying) for this round. Choose another round."
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 191,
                        columnNumber: 11
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 184,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                className: "relative mx-4 mt-4 min-h-[260px] md:absolute md:inset-0 md:mx-0 md:mt-0 md:pb-56 md:pl-4 md:pr-80 md:pt-24",
                children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_TrackView__rspack_import_6.TrackView, {
                    trackPath: trackPath,
                    driverStates: driverStates,
                    driverNames: driverNames,
                    selectedDrivers: [],
                    className: "h-full w-full"
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                    lineNumber: 199,
                    columnNumber: 9
                }, undefined)
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 198,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("footer", {
                className: "relative z-10 mx-4 mt-4 md:absolute md:bottom-4 md:left-4 md:right-80 md:mx-0 md:mt-0",
                children: [
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("div", {
                        className: "mb-2",
                        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_MarkerLegend__rspack_import_3.MarkerLegend, {
                            hasEvents: timelineEvents.length > 0,
                            legendCollapsed: legendCollapsed,
                            onToggleLegendCollapsed: toggleLegendCollapsed,
                            shortcutsCollapsed: shortcutsCollapsed,
                            onToggleShortcutsCollapsed: toggleShortcutsCollapsed
                        }, void 0, false, {
                            fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                            lineNumber: 210,
                            columnNumber: 11
                        }, undefined)
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 209,
                        columnNumber: 9
                    }, undefined),
                    /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_ControlsBar__rspack_import_2.ControlsBar, {
                        isPlaying: replay.isPlaying,
                        isBuffering: replay.isBuffering,
                        speed: prefs.speed,
                        currentTimeMs: replay.currentTimeMs,
                        startTimeMs: sessionStartMs,
                        endTimeMs: effectiveEndMs,
                        canPlay: canPlay,
                        timelineEvents: timelineEvents,
                        radioEnabled: prefs.radioEnabled,
                        drivers: drivers,
                        isRadioPlaying: isAudioPlaying,
                        skipIntervalLabel: skipIntervalLabel,
                        expanded: prefs.timelineExpanded,
                        onTogglePlay: replay.togglePlay,
                        onSkipBack: handleSkipBack,
                        onSkipForward: handleSkipForward,
                        onCycleSpeed: prefs.cycleSpeed,
                        onCycleSkipInterval: prefs.cycleSkipInterval,
                        onToggleExpanded: prefs.toggleTimelineExpanded,
                        onSeek: replay.seekTo,
                        onRadioToggle: prefs.toggleRadio,
                        onPlayRadio: playRadio,
                        onStopRadio: stopRadio,
                        onPauseRadio: pauseRadio,
                        onResumeRadio: resumeRadio,
                        onMarkerClick: handleMarkerClick
                    }, void 0, false, {
                        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, undefined)
                ]
            }, void 0, true, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 208,
                columnNumber: 7
            }, undefined),
            /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)("aside", {
                className: "relative z-10 mx-4 mt-4 mb-6 h-[60vh] min-h-[320px] md:absolute md:bottom-4 md:right-4 md:top-4 md:mx-0 md:mt-0 md:mb-0 md:h-auto md:min-h-0 md:w-72",
                children: /*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_components_TelemetryPanel__rspack_import_5.TelemetryPanel, {
                    summary: telemetrySummary,
                    rows: telemetryRows,
                    activeOvertakes: activeOvertakes
                }, void 0, false, {
                    fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                    lineNumber: 249,
                    columnNumber: 9
                }, undefined)
            }, void 0, false, {
                fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
                lineNumber: 248,
                columnNumber: 7
            }, undefined)
        ]
    }, void 0, true, {
        fileName: "/Users/wrick/Projects/f1/src/modules/replay/pages/ReplayPage.tsx",
        lineNumber: 142,
        columnNumber: 5
    }, undefined);
};
_s(ReplayPage, "Lg0lGa2XuWmv9gOCcsOY8EAm+Cc=", false, function() {
    return [
        _hooks_useSessionSelector__rspack_import_12.useSessionState,
        _hooks_useUserPreferences__rspack_import_15.useUserPreferences,
        _hooks_useReplayData__rspack_import_11.useReplayData,
        _hooks_useSessionSelector__rspack_import_12.useSessionAutoCorrect,
        _hooks_useReplayController__rspack_import_10.useReplayController,
        _hooks_useTrackComputation__rspack_import_14.useTrackComputation,
        _hooks_useTeamRadio__rspack_import_13.useTeamRadio,
        _hooks_useKeyboardShortcuts__rspack_import_9.useKeyboardShortcuts
    ];
});
_c = ReplayPage;
var _c;
$RefreshReg$(_c, "ReplayPage");

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/services/driverState.service.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  buildDriverNames: () => (buildDriverNames),
  computeDriverStates: () => (computeDriverStates)
});
/* import */ var _utils_format_util__rspack_import_0 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* import */ var _utils_telemetry_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/telemetry.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const computeDriverStates = (data, currentTimeMs, normalization)=>{
    const map = {};
    data.drivers.forEach((driver)=>{
        const telemetry = data.telemetryByDriver[driver.driver_number];
        const locationSample = (0,_utils_telemetry_util__rspack_import_1.interpolateLocation)((telemetry === null || telemetry === void 0 ? void 0 : telemetry.locations) ?? [], currentTimeMs);
        const positionSample = (0,_utils_telemetry_util__rspack_import_1.getCurrentPosition)((telemetry === null || telemetry === void 0 ? void 0 : telemetry.positions) ?? [], currentTimeMs);
        const racePosition = (positionSample === null || positionSample === void 0 ? void 0 : positionSample.position) ?? null;
        if (locationSample && Number.isFinite(locationSample.x) && Number.isFinite(locationSample.y) && Number.isFinite(locationSample.z)) {
            map[driver.driver_number] = {
                position: {
                    x: (locationSample.x - normalization.offset.x) * normalization.scale,
                    y: (locationSample.y - normalization.offset.y) * normalization.scale,
                    z: (locationSample.z - normalization.offset.z) * normalization.scale
                },
                color: `#${driver.team_colour}`,
                racePosition
            };
        } else {
            map[driver.driver_number] = {
                position: null,
                color: `#${driver.team_colour}`,
                racePosition
            };
        }
    });
    return map;
};
const buildDriverNames = (drivers)=>{
    return drivers.reduce((acc, driver)=>{
        acc[driver.driver_number] = (0,_utils_format_util__rspack_import_0.formatTrackLabel)(driver);
        return acc;
    }, {});
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/services/events.service.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  buildTimelineEvents: () => (buildTimelineEvents),
  getActiveOvertakes: () => (getActiveOvertakes)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const driverName = (driverNumber, drivers)=>{
    const driver = drivers.find((d)=>d.driver_number === driverNumber);
    return (driver === null || driver === void 0 ? void 0 : driver.name_acronym) ?? String(driverNumber);
};
const raceControlColor = (category, flag)=>{
    if (flag) {
        const upper = flag.toUpperCase();
        if (upper.includes("RED")) return "#ef4444";
        if (upper.includes("YELLOW") || upper.includes("DOUBLE")) return "#eab308";
        if (upper.includes("GREEN")) return "#eab308";
        if (upper.includes("BLUE")) return "#3b82f6";
        if (upper.includes("BLACK")) return "#6b7280";
        if (upper.includes("CHEQUERED")) return "#f5f5f5";
    }
    const upper = category.toUpperCase();
    if (upper.includes("SAFETY") || upper.includes("VSC")) return "#ef4444";
    if (upper.includes("DRS")) return "#a855f7";
    return "#a855f7";
};
const raceControlType = (category)=>{
    const upper = category.toUpperCase();
    if (upper.includes("FLAG")) return "flag";
    if (upper.includes("SAFETY") || upper.includes("VSC")) return "safety-car";
    return "race-control";
};
const buildTimelineEvents = (data, drivers)=>{
    const events = [];
    for (const radio of data.teamRadios){
        const name = driverName(radio.driver_number, drivers);
        events.push({
            timestampMs: radio.timestampMs,
            type: "radio",
            color: "#3b82f6",
            label: `Radio: ${name}`,
            detail: `Team radio from ${name}`,
            driverNumbers: [
                radio.driver_number
            ],
            data: radio
        });
    }
    for (const overtake of data.overtakes){
        const overtaking = driverName(overtake.overtaking_driver_number, drivers);
        const overtaken = driverName(overtake.overtaken_driver_number, drivers);
        events.push({
            timestampMs: overtake.timestampMs,
            type: "overtake",
            color: "#22c55e",
            label: `P${overtake.position} ${overtaking} passes ${overtaken}`,
            detail: `${overtaking} overtakes ${overtaken} for P${overtake.position}`,
            driverNumbers: [
                overtake.overtaking_driver_number,
                overtake.overtaken_driver_number
            ],
            data: overtake
        });
    }
    for (const rc of data.raceControl){
        events.push({
            timestampMs: rc.timestampMs,
            type: raceControlType(rc.category),
            color: raceControlColor(rc.category, rc.flag),
            label: rc.message,
            detail: `${rc.category}: ${rc.message}`,
            driverNumbers: rc.driver_number ? [
                rc.driver_number
            ] : undefined,
            data: rc
        });
    }
    for (const pit of data.pits){
        const name = driverName(pit.driver_number, drivers);
        events.push({
            timestampMs: pit.timestampMs,
            type: "pit",
            color: "#6b7280",
            label: `Pit: ${name}`,
            detail: `${name} pit stop (Lap ${pit.lap_number})`,
            driverNumbers: [
                pit.driver_number
            ],
            data: pit
        });
    }
    events.sort((a, b)=>a.timestampMs - b.timestampMs);
    return events;
};
const getActiveOvertakes = function(overtakes, currentTimeMs) {
    let windowMs = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 3000;
    const result = [];
    for(let i = overtakes.length - 1; i >= 0; i--){
        const diff = currentTimeMs - overtakes[i].timestampMs;
        if (diff >= 0 && diff <= windowMs) {
            result.push(overtakes[i]);
        }
        if (diff > windowMs) break;
    }
    return result;
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/services/telemetry.service.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  buildYearOptions: () => (buildYearOptions),
  chunkAppend: () => (chunkAppend),
  computeTelemetryRows: () => (computeTelemetryRows),
  computeTelemetrySummary: () => (computeTelemetrySummary),
  createTelemetryMap: () => (createTelemetryMap),
  filterEndedMeetings: () => (filterEndedMeetings),
  getLatestTelemetryTimestamp: () => (getLatestTelemetryTimestamp)
});
/* import */ var _utils_format_util__rspack_import_0 = __webpack_require__("./src/modules/replay/utils/format.util.ts");
/* import */ var _utils_telemetry_util__rspack_import_1 = __webpack_require__("./src/modules/replay/utils/telemetry.util.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const getLatestTelemetryTimestamp = (telemetryByDriver)=>{
    let latest = 0;
    Object.values(telemetryByDriver).forEach((telemetry)=>{
        const lastSample = telemetry.locations[telemetry.locations.length - 1] ?? null;
        if (lastSample && lastSample.timestampMs > latest) {
            latest = lastSample.timestampMs;
        }
    });
    return latest;
};
const createTelemetryMap = (drivers)=>{
    return drivers.reduce((acc, driver)=>{
        acc[driver.driver_number] = {
            locations: [],
            positions: [],
            stints: [],
            laps: []
        };
        return acc;
    }, {});
};
const buildYearOptions = (currentYear)=>Array.from({
        length: 6
    }, (_, index)=>currentYear - index);
const filterEndedMeetings = (meetings, now)=>{
    return meetings.filter((meeting)=>{
        const name = `${meeting.meeting_name} ${meeting.meeting_official_name}`;
        const endMs = new Date(meeting.date_end).getTime();
        return !/pre[- ]season/i.test(name) && endMs <= now;
    });
};
const chunkAppend = (map, chunk)=>{
    const grouped = (0,_utils_telemetry_util__rspack_import_1.groupByDriverNumber)(chunk);
    Object.entries(grouped).forEach((param)=>{
        let [driverKey, samples] = param;
        const driverNumber = Number(driverKey);
        if (!map[driverNumber]) {
            map[driverNumber] = [];
        }
        map[driverNumber].push(...samples);
    });
};
const computeTelemetrySummary = (data, availableEndMs, effectiveEndMs, sessionStartMs)=>{
    if (!data) {
        return {
            sessionLabel: "No session loaded",
            coverageLabel: "--",
            totalDrivers: 0
        };
    }
    const sessionLabel = `${data.session.session_name} · ${data.session.session_type}`;
    const coverageLabel = `${Math.max(1, Math.floor((effectiveEndMs - sessionStartMs) / 60000))} min`;
    return {
        sessionLabel,
        coverageLabel,
        totalDrivers: data.drivers.length
    };
};
const computeTelemetryRows = (data, currentTimeMs)=>{
    if (!data) {
        return [];
    }
    return data.drivers.map((driver)=>{
        var _laps_;
        const telemetry = data.telemetryByDriver[driver.driver_number];
        const positions = (telemetry === null || telemetry === void 0 ? void 0 : telemetry.positions) ?? [];
        const laps = (telemetry === null || telemetry === void 0 ? void 0 : telemetry.laps) ?? [];
        const positionSample = (0,_utils_telemetry_util__rspack_import_1.getCurrentPosition)(positions, currentTimeMs) ?? positions[positions.length - 1] ?? null;
        const lapNumber = (0,_utils_telemetry_util__rspack_import_1.getCurrentLap)(laps, currentTimeMs) ?? ((_laps_ = laps[laps.length - 1]) === null || _laps_ === void 0 ? void 0 : _laps_.lap_number) ?? null;
        const stints = (telemetry === null || telemetry === void 0 ? void 0 : telemetry.stints) ?? [];
        const stint = (0,_utils_telemetry_util__rspack_import_1.getCurrentStint)(stints, lapNumber);
        const fallbackStint = stint ?? (stints.length > 0 ? stints[stints.length - 1] : null);
        return {
            driverNumber: driver.driver_number,
            driverName: (0,_utils_format_util__rspack_import_0.formatTelemetryLabel)(driver),
            driverAcronym: driver.name_acronym,
            position: (positionSample === null || positionSample === void 0 ? void 0 : positionSample.position) ?? null,
            lap: lapNumber,
            compound: (fallbackStint === null || fallbackStint === void 0 ? void 0 : fallbackStint.compound) ?? null
        };
    }).sort((a, b)=>{
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position;
    });
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/services/trackBuilder.service.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  buildReferencePositions: () => (buildReferencePositions),
  buildTrackPath: () => (buildTrackPath)
});
/* import */ var _constants_replay_constants__rspack_import_0 = __webpack_require__("./src/modules/replay/constants/replay.constants.ts");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");

const buildReferencePositions = (data)=>{
    if (!data.drivers.length) {
        return [];
    }
    const quantize = (value)=>Math.round(value / _constants_replay_constants__rspack_import_0.TRACK_POINT_QUANTIZE);
    const seen = new Set();
    const gap = {
        x: Number.NaN,
        y: Number.NaN,
        z: Number.NaN,
        timestampMs: Number.NaN
    };
    const merged = [];
    for (const driver of data.drivers){
        var _telemetry_locations;
        const telemetry = data.telemetryByDriver[driver.driver_number];
        if (!(telemetry === null || telemetry === void 0 ? void 0 : (_telemetry_locations = telemetry.locations) === null || _telemetry_locations === void 0 ? void 0 : _telemetry_locations.length)) {
            continue;
        }
        const sorted = [
            ...telemetry.locations
        ].sort((a, b)=>a.timestampMs - b.timestampMs);
        let addedForDriver = false;
        sorted.forEach((sample)=>{
            if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
                return;
            }
            const key = `${quantize(sample.x)},${quantize(sample.y)}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            if (!addedForDriver && merged.length > 0) {
                merged.push(gap);
            }
            addedForDriver = true;
            merged.push(sample);
        });
    }
    return merged;
};
const buildTrackPath = (referencePositions, normalization)=>{
    if (!referencePositions.length) {
        return [];
    }
    const points = [];
    let lastTimestamp = null;
    referencePositions.forEach((sample)=>{
        if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
            lastTimestamp = null;
            return;
        }
        if (lastTimestamp !== null && sample.timestampMs - lastTimestamp > _constants_replay_constants__rspack_import_0.TRACK_TIME_GAP_MS) {
            points.push({
                x: Number.NaN,
                y: Number.NaN,
                z: Number.NaN
            });
        }
        points.push({
            x: (sample.x - normalization.offset.x) * normalization.scale,
            y: (sample.y - normalization.offset.y) * normalization.scale,
            z: (sample.z - normalization.offset.z) * normalization.scale
        });
        lastTimestamp = sample.timestampMs;
    });
    return points;
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/services/weather.service.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  getWeatherAtTime: () => (getWeatherAtTime)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const getWeatherAtTime = (weather, currentTimeMs)=>{
    if (!weather.length) return null;
    let left = 0;
    let right = weather.length - 1;
    while(left <= right){
        const mid = Math.floor((left + right) / 2);
        if (weather[mid].timestampMs <= currentTimeMs) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return right >= 0 ? weather[right] : null;
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/utils/format.util.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  formatTelemetryLabel: () => (formatTelemetryLabel),
  formatTime: () => (formatTime),
  formatTrackLabel: () => (formatTrackLabel),
  getCompoundBadge: () => (getCompoundBadge),
  getCompoundLabel: () => (getCompoundLabel),
  normalizeCompound: () => (normalizeCompound)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const formatTime = (timestampMs)=>{
    const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
};
const formatTrackLabel = (driver)=>{
    return driver.name_acronym || driver.full_name;
};
const formatTelemetryLabel = (driver)=>{
    return driver.broadcast_name || driver.full_name;
};
const normalizeCompound = (compound)=>{
    if (!compound) {
        return null;
    }
    return compound.trim().toUpperCase();
};
const getCompoundBadge = (compound)=>{
    const upper = normalizeCompound(compound);
    if (!upper) {
        return "-";
    }
    if (upper.startsWith("HARD")) return "H";
    if (upper.startsWith("MED")) return "M";
    if (upper.startsWith("SOF")) return "S";
    if (upper.startsWith("INT")) return "I";
    if (upper.startsWith("WET")) return "W";
    return upper.charAt(0) || "-";
};
const getCompoundLabel = (compound)=>{
    const upper = normalizeCompound(compound);
    if (!upper) {
        return "Unknown";
    }
    if (upper.startsWith("HARD")) return "Hard";
    if (upper.startsWith("MED")) return "Medium";
    if (upper.startsWith("SOF")) return "Soft";
    if (upper.startsWith("INT")) return "Intermediate";
    if (upper.startsWith("WET")) return "Wet";
    return compound ?? "Unknown";
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/utils/geometry.util.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  LABEL_HEIGHT: () => (LABEL_HEIGHT),
  LABEL_OFFSET: () => (LABEL_OFFSET),
  LABEL_PADDING: () => (LABEL_PADDING),
  MIN_LABEL_WIDTH: () => (MIN_LABEL_WIDTH),
  SCALE: () => (SCALE),
  VIEWBOX_PADDING: () => (VIEWBOX_PADDING),
  buildPathD: () => (buildPathD),
  computeBounds: () => (computeBounds),
  computeLabelOffset: () => (computeLabelOffset),
  getLabelWidth: () => (getLabelWidth),
  resolveCollisions: () => (resolveCollisions),
  smoothLabels: () => (smoothLabels),
  toPoint2D: () => (toPoint2D)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const SCALE = 1000;
const LABEL_OFFSET = 55;
const MIN_LABEL_WIDTH = 50;
const LABEL_HEIGHT = 24;
const LABEL_PADDING = 10;
const VIEWBOX_PADDING = 200;
const MIN_SEGMENT_JUMP = 60;
const JUMP_MULTIPLIER = 8;
const toPoint2D = (point)=>({
        x: point.x * SCALE,
        y: point.y * SCALE
    });
const computeBounds = (points)=>{
    const validPoints = points.filter((point)=>Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!validPoints.length) {
        return {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
            width: 0,
            height: 0,
            center: {
                x: 0,
                y: 0
            }
        };
    }
    const xs = validPoints.map((point)=>point.x);
    const ys = validPoints.map((point)=>point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        center: {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        }
    };
};
const computeLabelOffset = (position, center)=>{
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalizedX = dx / distance;
    const normalizedY = dy / distance;
    return {
        x: normalizedX * LABEL_OFFSET,
        y: normalizedY * LABEL_OFFSET
    };
};
const buildPathD = (points)=>{
    if (points.length < 2) {
        return "";
    }
    const distances = [];
    let lastValid = null;
    points.forEach((point)=>{
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            lastValid = null;
            return;
        }
        if (lastValid) {
            distances.push(Math.hypot(point.x - lastValid.x, point.y - lastValid.y));
        }
        lastValid = point;
    });
    const sorted = [
        ...distances
    ].sort((a, b)=>a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : MIN_SEGMENT_JUMP;
    const jumpThreshold = Math.max(median * JUMP_MULTIPLIER, MIN_SEGMENT_JUMP);
    let path = "";
    let previous = null;
    points.forEach((point)=>{
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            previous = null;
            return;
        }
        const isFirst = !previous;
        const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
        if (isFirst || distance > jumpThreshold) {
            path += `${path ? " " : ""}M ${point.x} ${point.y}`;
        } else {
            path += ` L ${point.x} ${point.y}`;
        }
        previous = point;
    });
    return path;
};
const getLabelWidth = (text)=>Math.max(MIN_LABEL_WIDTH, text.length * 8.5 + LABEL_PADDING * 2);
const COLLISION_PAD = 3;
const MAX_ITERATIONS = 60;
const DOT_OBSTACLE_SIZE = 16;
const rectsOverlap = (a, b)=>{
    const aLeft = a.x - a.width / 2 - COLLISION_PAD;
    const aRight = a.x + a.width / 2 + COLLISION_PAD;
    const aTop = a.y - a.height / 2 - COLLISION_PAD;
    const aBottom = a.y + a.height / 2 + COLLISION_PAD;
    const bLeft = b.x - b.width / 2 - COLLISION_PAD;
    const bRight = b.x + b.width / 2 + COLLISION_PAD;
    const bTop = b.y - b.height / 2 - COLLISION_PAD;
    const bBottom = b.y + b.height / 2 + COLLISION_PAD;
    return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
};
const resolveCollisions = (labels, _iterations, viewbox)=>{
    const result = labels.map((l)=>({
            ...l
        }));
    const count = result.length;
    // Build dot obstacles from all anchors (driver positions)
    const dotObstacles = result.map((l, i)=>({
            key: `dot-${i}`,
            x: l.anchorX,
            y: l.anchorY,
            width: DOT_OBSTACLE_SIZE,
            height: DOT_OBSTACLE_SIZE,
            anchorX: l.anchorX,
            anchorY: l.anchorY
        }));
    for(let iter = 0; iter < MAX_ITERATIONS; iter++){
        let anyOverlap = false;
        // Label-label collisions
        for(let i = 0; i < count; i++){
            for(let j = i + 1; j < count; j++){
                const a = result[i];
                const b = result[j];
                if (!rectsOverlap(a, b)) continue;
                anyOverlap = true;
                const overlapX = (a.width + b.width) / 2 + COLLISION_PAD * 2 - Math.abs(a.x - b.x);
                const overlapY = (a.height + b.height) / 2 + COLLISION_PAD * 2 - Math.abs(a.y - b.y);
                if (overlapY <= overlapX) {
                    const pushY = overlapY / 2 + 1;
                    if (a.y <= b.y) {
                        a.y -= pushY;
                        b.y += pushY;
                    } else {
                        a.y += pushY;
                        b.y -= pushY;
                    }
                } else {
                    const pushX = overlapX / 2 + 1;
                    if (a.x <= b.x) {
                        a.x -= pushX;
                        b.x += pushX;
                    } else {
                        a.x += pushX;
                        b.x -= pushX;
                    }
                }
            }
        }
        // Label-dot collisions (push label away from other drivers' dots)
        for(let i = 0; i < count; i++){
            const label = result[i];
            for(let d = 0; d < dotObstacles.length; d++){
                if (d === i) continue; // skip own anchor dot
                const dot = dotObstacles[d];
                if (!rectsOverlap(label, dot)) continue;
                anyOverlap = true;
                const overlapX = (label.width + dot.width) / 2 + COLLISION_PAD * 2 - Math.abs(label.x - dot.x);
                const overlapY = (label.height + dot.height) / 2 + COLLISION_PAD * 2 - Math.abs(label.y - dot.y);
                // Only push the label, not the dot (dot is fixed)
                if (overlapY <= overlapX) {
                    label.y += label.y <= dot.y ? -overlapY - 1 : overlapY + 1;
                } else {
                    label.x += label.x <= dot.x ? -overlapX - 1 : overlapX + 1;
                }
            }
        }
        if (!anyOverlap) break;
    }
    // Clamp to viewbox only after convergence (not during iterations)
    if (viewbox) {
        for(let i = 0; i < count; i++){
            const label = result[i];
            const halfW = label.width / 2;
            const halfH = label.height / 2;
            label.x = Math.max(viewbox.minX + halfW, Math.min(viewbox.maxX - halfW, label.x));
            label.y = Math.max(viewbox.minY + halfH, Math.min(viewbox.maxY - halfH, label.y));
        }
    }
    return result;
};
const DEFAULT_SMOOTH_FACTOR = 0.5;
const smoothLabels = function(previous, current) {
    let factor = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : DEFAULT_SMOOTH_FACTOR;
    if (!previous.length) return current;
    const prevMap = new Map();
    for (const label of previous){
        prevMap.set(label.key, label);
    }
    return current.map((cur)=>{
        const prev = prevMap.get(cur.key);
        if (!prev) return cur;
        return {
            ...cur,
            x: prev.x + (cur.x - prev.x) * factor,
            y: prev.y + (cur.y - prev.y) * factor
        };
    });
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/modules/replay/utils/telemetry.util.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  findSampleAtTime: () => (findSampleAtTime),
  getCurrentLap: () => (getCurrentLap),
  getCurrentPosition: () => (getCurrentPosition),
  getCurrentStint: () => (getCurrentStint),
  groupByDriverNumber: () => (groupByDriverNumber),
  interpolateLocation: () => (interpolateLocation),
  normalizePositions: () => (normalizePositions),
  sortByTimestamp: () => (sortByTimestamp),
  toTimestampMs: () => (toTimestampMs),
  withTimestamp: () => (withTimestamp)
});
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");
const toTimestampMs = (isoDate)=>new Date(isoDate).getTime();
const withTimestamp = (items)=>{
    return items.map((item)=>{
        const dateValue = item.date ?? item.date_start;
        return {
            ...item,
            timestampMs: dateValue ? toTimestampMs(dateValue) : Number.NaN
        };
    });
};
const groupByDriverNumber = (items)=>{
    return items.reduce((acc, item)=>{
        const key = item.driver_number;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(item);
        return acc;
    }, {});
};
const sortByTimestamp = (items)=>{
    return [
        ...items
    ].sort((a, b)=>a.timestampMs - b.timestampMs);
};
const findSampleAtTime = (items, timestampMs)=>{
    if (!items.length) {
        return null;
    }
    let left = 0;
    let right = items.length - 1;
    while(left <= right){
        const mid = Math.floor((left + right) / 2);
        const value = items[mid].timestampMs;
        if (value === timestampMs) {
            return items[mid];
        }
        if (value < timestampMs) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return items[Math.max(0, right)] ?? null;
};
const interpolateLocation = (samples, timestampMs)=>{
    if (!samples.length) {
        return null;
    }
    let leftIndex = 0;
    let rightIndex = samples.length - 1;
    while(leftIndex < rightIndex - 1){
        const mid = Math.floor((leftIndex + rightIndex) / 2);
        if (samples[mid].timestampMs <= timestampMs) {
            leftIndex = mid;
        } else {
            rightIndex = mid;
        }
    }
    const left = samples[leftIndex];
    const right = samples[rightIndex];
    if (!left || !right) {
        return null;
    }
    if (left.timestampMs === right.timestampMs) {
        return left;
    }
    const ratio = (timestampMs - left.timestampMs) / (right.timestampMs - left.timestampMs);
    return {
        ...left,
        x: left.x + (right.x - left.x) * ratio,
        y: left.y + (right.y - left.y) * ratio,
        z: left.z + (right.z - left.z) * ratio,
        timestampMs
    };
};
const normalizePositions = (samples)=>{
    const validSamples = samples.filter((sample)=>Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z));
    if (!validSamples.length) {
        return {
            normalized: [],
            scale: 1,
            offset: {
                x: 0,
                y: 0,
                z: 0
            }
        };
    }
    const xs = validSamples.map((sample)=>sample.x);
    const ys = validSamples.map((sample)=>sample.y);
    const zs = validSamples.map((sample)=>sample.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const scale = 1 / Math.max(rangeX, rangeY, rangeZ);
    const offset = {
        x: minX + rangeX / 2,
        y: minY + rangeY / 2,
        z: minZ + rangeZ / 2
    };
    const normalized = validSamples.map((sample)=>({
            x: (sample.x - offset.x) * scale,
            y: (sample.y - offset.y) * scale,
            z: (sample.z - offset.z) * scale
        }));
    return {
        normalized,
        scale,
        offset
    };
};
const getCurrentLap = (laps, timestampMs)=>{
    const sample = findSampleAtTime(laps, timestampMs);
    return (sample === null || sample === void 0 ? void 0 : sample.lap_number) ?? null;
};
const getCurrentStint = (stints, lapNumber)=>{
    if (lapNumber === null) {
        return null;
    }
    return stints.find((stint)=>lapNumber >= stint.lap_start && lapNumber <= stint.lap_end) ?? null;
};
const getCurrentPosition = (positions, timestampMs)=>{
    return findSampleAtTime(positions, timestampMs);
};

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/routes/__root.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  rootRoute: () => (rootRoute)
});
/* import */ var react_jsx_dev_runtime__rspack_import_0 = __webpack_require__("./node_modules/react/jsx-dev-runtime.js");
/* import */ var _tanstack_react_router__rspack_import_1 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/route.js");
/* import */ var _tanstack_react_router__rspack_import_2 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/Match.js");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const rootRoute = (0,_tanstack_react_router__rspack_import_1.createRootRoute)({
    component: ()=>/*#__PURE__*/ (0,react_jsx_dev_runtime__rspack_import_0.jsxDEV)(_tanstack_react_router__rspack_import_2.Outlet, {}, void 0, false, {
            fileName: "/Users/wrick/Projects/f1/src/routes/__root.tsx",
            lineNumber: 4,
            columnNumber: 20
        }, undefined)
});

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/routes/index.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  indexRoute: () => (indexRoute)
});
/* import */ var _tanstack_react_router__rspack_import_1 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/route.js");
/* import */ var _tanstack_react_router__rspack_import_2 = __webpack_require__("./node_modules/@tanstack/router-core/dist/esm/redirect.js");
/* import */ var _root__rspack_import_0 = __webpack_require__("./src/routes/__root.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");


const indexRoute = (0,_tanstack_react_router__rspack_import_1.createRoute)({
    getParentRoute: ()=>_root__rspack_import_0.rootRoute,
    path: "/",
    beforeLoad: ()=>{
        throw (0,_tanstack_react_router__rspack_import_2.redirect)({
            to: "/replay"
        });
    }
});

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/routes/replay.tsx"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  replayRoute: () => (replayRoute)
});
/* import */ var _tanstack_react_router__rspack_import_2 = __webpack_require__("./node_modules/@tanstack/react-router/dist/esm/route.js");
/* import */ var modules_replay__rspack_import_0 = __webpack_require__("./src/modules/replay/index.ts");
/* import */ var _root__rspack_import_1 = __webpack_require__("./src/routes/__root.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");



const replayRoute = (0,_tanstack_react_router__rspack_import_2.createRoute)({
    getParentRoute: ()=>_root__rspack_import_1.rootRoute,
    path: "/replay",
    validateSearch: (search)=>({
            year: typeof search.year === "number" ? search.year : undefined,
            round: typeof search.round === "number" ? search.round : undefined,
            session: typeof search.session === "string" ? search.session : undefined
        }),
    component: modules_replay__rspack_import_0.ReplayPage
});

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"./src/routes/routeTree.ts"(module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  routeTree: () => (routeTree)
});
/* import */ var _root__rspack_import_0 = __webpack_require__("./src/routes/__root.tsx");
/* import */ var _index__rspack_import_1 = __webpack_require__("./src/routes/index.tsx");
/* import */ var _replay__rspack_import_2 = __webpack_require__("./src/routes/replay.tsx");
/* provided dependency */ var $ReactRefreshRuntime$ = __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefresh.js");



const routeTree = _root__rspack_import_0.rootRoute.addChildren([
    _index__rspack_import_1.indexRoute,
    _replay__rspack_import_2.replayRoute
]);

function $RefreshSig$() { return $ReactRefreshRuntime$.createSignatureFunctionForTransform() }
function $RefreshReg$(type, id) { $ReactRefreshRuntime$.register(type, module.id + "_" + id) }
Promise.resolve().then(() => { $ReactRefreshRuntime$.refresh(module.id, module.hot) });


},
"data:text/javascript,import%20%7B%20init%20%7D%20from%20'%2FUsers%2Fwrick%2FProjects%2Ff1%2Fnode_modules%2F%40rsbuild%2Fcore%2Fdist%2Fclient%2Fhmr.js'%3B%0Aimport%20'%2FUsers%2Fwrick%2FProjects%2Ff1%2Fnode_modules%2F%40rsbuild%2Fcore%2Fdist%2Fclient%2Foverlay.js'%3B%0Ainit(%0A%20%20'b1f1e9ab6f1ef3f8'%2C%0A%20%20%7B%22path%22%3A%22%2Frsbuild-hmr%22%2C%22port%22%3A%22%22%2C%22host%22%3A%22%22%2C%22overlay%22%3Atrue%2C%22reconnect%22%3A100%2C%22logLevel%22%3A%22info%22%7D%2C%0A%20%20%22localhost%22%2C%0A%20%203001%2C%0A%20%20true%2C%0A%20%20true%2C%0A%20%20%22info%22%0A)%0A"(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _Users_wrick_Projects_f1_node_modules_rsbuild_core_dist_client_hmr_js__rspack_import_0 = __webpack_require__("./node_modules/@rsbuild/core/dist/client/hmr.js");
/* import */ var _Users_wrick_Projects_f1_node_modules_rsbuild_core_dist_client_overlay_js__rspack_import_1 = __webpack_require__("./node_modules/@rsbuild/core/dist/client/overlay.js");


(0,_Users_wrick_Projects_f1_node_modules_rsbuild_core_dist_client_hmr_js__rspack_import_0.init)('b1f1e9ab6f1ef3f8', {
    "path": "/rsbuild-hmr",
    "port": "",
    "host": "",
    "overlay": true,
    "reconnect": 100,
    "logLevel": "info"
}, "localhost", 3001, true, true, "info");


},

});
// The module cache
var __webpack_module_cache__ = {};

// The require function
function __webpack_require__(moduleId) {

// Check if module is in cache
var cachedModule = __webpack_module_cache__[moduleId];
if (cachedModule !== undefined) {
if (cachedModule.error !== undefined) throw cachedModule.error;
return cachedModule.exports;
}
// Create a new module (and put it into the cache)
var module = (__webpack_module_cache__[moduleId] = {
id: moduleId,
loaded: false,
exports: {}
});
// Execute the module function
try {


        var execOptions = { id: moduleId, module: module, factory: __webpack_modules__[moduleId], require: __webpack_require__ };
        __webpack_require__.i.forEach(function(handler) { handler(execOptions); });
        module = execOptions.module;
        if (!execOptions.factory) {
          console.error("undefined factory", moduleId);
          throw Error("RuntimeError: factory is undefined (" + moduleId + ")");
        }
        execOptions.factory.call(module.exports, module, module.exports, execOptions.require);
      
} catch (e) {
module.error = e;
throw e;
}
// Flag the module as loaded
module.loaded = true;
// Return the exports of the module
return module.exports;

}

// expose the modules object (__webpack_modules__)
__webpack_require__.m = __webpack_modules__;

// expose the module cache
__webpack_require__.c = __webpack_module_cache__;

// expose the module execution interceptor
__webpack_require__.i = [];

// webpack/runtime/compat_get_default_export
(() => {
// getDefaultExport function for compatibility with non-ESM modules
__webpack_require__.n = (module) => {
	var getter = module && module.__esModule ?
		() => (module['default']) :
		() => (module);
	__webpack_require__.d(getter, { a: getter });
	return getter;
};

})();
// webpack/runtime/create_fake_namespace_object
(() => {
var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
var leafPrototypes;
// create a fake namespace object
// mode & 1: value is a module id, require it
// mode & 2: merge all properties of value into the ns
// mode & 4: return value when already ns object
// mode & 16: return value when it's Promise-like
// mode & 8|1: behave like require
__webpack_require__.t = function(value, mode) {
	if(mode & 1) value = this(value);
	if(mode & 8) return value;
	if(typeof value === 'object' && value) {
		if((mode & 4) && value.__esModule) return value;
		if((mode & 16) && typeof value.then === 'function') return value;
	}
	var ns = Object.create(null);
  __webpack_require__.r(ns);
	var def = {};
	leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
	for(var current = mode & 2 && value; (typeof current == 'object' || typeof current == 'function') && !~leafPrototypes.indexOf(current); current = getProto(current)) {
		Object.getOwnPropertyNames(current).forEach((key) => { def[key] = () => (value[key]) });
	}
	def['default'] = () => (value);
	__webpack_require__.d(ns, def);
	return ns;
};
})();
// webpack/runtime/define_property_getters
(() => {
__webpack_require__.d = (exports, definition) => {
	for(var key in definition) {
        if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
            Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
        }
    }
};
})();
// webpack/runtime/get mini-css chunk filename
(() => {
// This function allow to reference chunks
__webpack_require__.miniCssF = (chunkId) => {
  // return url for filenames not based on template
  
  // return url for filenames based on template
  return "static/css/" + chunkId + ".css"
}
})();
// webpack/runtime/get_chunk_update_filename
(() => {
__webpack_require__.hu = (chunkId) => ('' + chunkId + '.' + __webpack_require__.h() + '.hot-update.js')
})();
// webpack/runtime/get_full_hash
(() => {
__webpack_require__.h = () => ("1c03f47fdd9644b7")
})();
// webpack/runtime/get_main_filename/update manifest
(() => {
__webpack_require__.hmrF = function () {
            return "index." + __webpack_require__.h() + ".hot-update.json";
         };
        
})();
// webpack/runtime/has_own_property
(() => {
__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
})();
// webpack/runtime/hot_module_replacement
(() => {
var currentModuleData = {};
var installedModules = __webpack_require__.c;

// module and require creation
var currentChildModule;
var currentParents = [];

// status
var registeredStatusHandlers = [];
var currentStatus = "idle";

// while downloading
var blockingPromises = 0;
var blockingPromisesWaiting = [];

// The update info
var currentUpdateApplyHandlers;
var queuedInvalidatedModules;

__webpack_require__.hmrD = currentModuleData;
__webpack_require__.i.push(function (options) {
	var module = options.module;
	var require = createRequire(options.require, options.id);
	module.hot = createModuleHotObject(options.id, module);
	module.parents = currentParents;
	module.children = [];
	currentParents = [];
	options.require = require;
});

__webpack_require__.hmrC = {};
__webpack_require__.hmrI = {};

function createRequire(require, moduleId) {
	var me = installedModules[moduleId];
	if (!me) return require;
	var fn = function (request) {
		if (me.hot.active) {
			if (installedModules[request]) {
				var parents = installedModules[request].parents;
				if (parents.indexOf(moduleId) === -1) {
					parents.push(moduleId);
				}
			} else {
				currentParents = [moduleId];
				currentChildModule = request;
			}
			if (me.children.indexOf(request) === -1) {
				me.children.push(request);
			}
		} else {
			console.warn(
				"[HMR] unexpected require(" +
				request +
				") from disposed module " +
				moduleId
			);
			currentParents = [];
		}
		return require(request);
	};
	var createPropertyDescriptor = function (name) {
		return {
			configurable: true,
			enumerable: true,
			get: function () {
				return require[name];
			},
			set: function (value) {
				require[name] = value;
			}
		};
	};
	for (var name in require) {
		if (Object.prototype.hasOwnProperty.call(require, name) && name !== "e") {
			Object.defineProperty(fn, name, createPropertyDescriptor(name));
		}
	}

	fn.e = function (chunkId, fetchPriority) {
		return trackBlockingPromise(require.e(chunkId, fetchPriority));
	};

	return fn;
}

function createModuleHotObject(moduleId, me) {
	var _main = currentChildModule !== moduleId;
	var hot = {
		_acceptedDependencies: {},
		_acceptedErrorHandlers: {},
		_declinedDependencies: {},
		_selfAccepted: false,
		_selfDeclined: false,
		_selfInvalidated: false,
		_disposeHandlers: [],
		_main: _main,
		_requireSelf: function () {
			currentParents = me.parents.slice();
			currentChildModule = _main ? undefined : moduleId;
			__webpack_require__(moduleId);
		},
		active: true,
		accept: function (dep, callback, errorHandler) {
			if (dep === undefined) hot._selfAccepted = true;
			else if (typeof dep === "function") hot._selfAccepted = dep;
			else if (typeof dep === "object" && dep !== null) {
				for (var i = 0; i < dep.length; i++) {
					hot._acceptedDependencies[dep[i]] = callback || function () { };
					hot._acceptedErrorHandlers[dep[i]] = errorHandler;
				}
			} else {
				hot._acceptedDependencies[dep] = callback || function () { };
				hot._acceptedErrorHandlers[dep] = errorHandler;
			}
		},
		decline: function (dep) {
			if (dep === undefined) hot._selfDeclined = true;
			else if (typeof dep === "object" && dep !== null)
				for (var i = 0; i < dep.length; i++)
					hot._declinedDependencies[dep[i]] = true;
			else hot._declinedDependencies[dep] = true;
		},
		dispose: function (callback) {
			hot._disposeHandlers.push(callback);
		},
		addDisposeHandler: function (callback) {
			hot._disposeHandlers.push(callback);
		},
		removeDisposeHandler: function (callback) {
			var idx = hot._disposeHandlers.indexOf(callback);
			if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
		},
		invalidate: function () {
			this._selfInvalidated = true;
			switch (currentStatus) {
				case "idle":
					currentUpdateApplyHandlers = [];
					Object.keys(__webpack_require__.hmrI).forEach(function (key) {
						__webpack_require__.hmrI[key](moduleId, currentUpdateApplyHandlers);
					});
					setStatus("ready");
					break;
				case "ready":
					Object.keys(__webpack_require__.hmrI).forEach(function (key) {
						__webpack_require__.hmrI[key](moduleId, currentUpdateApplyHandlers);
					});
					break;
				case "prepare":
				case "check":
				case "dispose":
				case "apply":
					(queuedInvalidatedModules = queuedInvalidatedModules || []).push(
						moduleId
					);
					break;
				default:
					break;
			}
		},
		check: hotCheck,
		apply: hotApply,
		status: function (l) {
			if (!l) return currentStatus;
			registeredStatusHandlers.push(l);
		},
		addStatusHandler: function (l) {
			registeredStatusHandlers.push(l);
		},
		removeStatusHandler: function (l) {
			var idx = registeredStatusHandlers.indexOf(l);
			if (idx >= 0) registeredStatusHandlers.splice(idx, 1);
		},
		data: currentModuleData[moduleId]
	};
	currentChildModule = undefined;
	return hot;
}

function setStatus(newStatus) {
	currentStatus = newStatus;
	
	var results = [];
	for (var i = 0; i < registeredStatusHandlers.length; i++)
		results[i] = registeredStatusHandlers[i].call(null, newStatus);

	return Promise.all(results).then(function () { });
}

function unblock() {
	if (--blockingPromises === 0) {
		setStatus("ready").then(function () {
			if (blockingPromises === 0) {
				var list = blockingPromisesWaiting;
				blockingPromisesWaiting = [];
				for (var i = 0; i < list.length; i++) {
					list[i]();
				}
			}
		});
	}
}

function trackBlockingPromise(promise) {
	switch (currentStatus) {
		case "ready":
			setStatus("prepare");
		case "prepare":
			blockingPromises++;
			promise.then(unblock, unblock);
			return promise;
		default:
			return promise;
	}
}

function waitForBlockingPromises(fn) {
	if (blockingPromises === 0) return fn();
	return new Promise(function (resolve) {
		blockingPromisesWaiting.push(function () {
			resolve(fn());
		});
	});
}

function hotCheck(applyOnUpdate) {
	if (currentStatus !== "idle") {
		throw new Error("check() is only allowed in idle status");
	}
	
	return setStatus("check")
		.then(__webpack_require__.hmrM)
		.then(function (update) {
			if (!update) {
				return setStatus(applyInvalidatedModules() ? "ready" : "idle").then(
					function () {
						return null;
					}
				);
			}

			return setStatus("prepare").then(function () {
				var updatedModules = [];
				currentUpdateApplyHandlers = [];

				return Promise.all(
					Object.keys(__webpack_require__.hmrC).reduce(function (
						promises,
						key
					) {
						__webpack_require__.hmrC[key](
							update.c,
							update.r,
							update.m,
							promises,
							currentUpdateApplyHandlers,
							updatedModules
						);
						return promises;
					},
						[])
				).then(function () {
					return waitForBlockingPromises(function () {
						if (applyOnUpdate) {
							return internalApply(applyOnUpdate);
						}
						return setStatus("ready").then(function () {
							return updatedModules;
						});
					});
				});
			});
		});
}

function hotApply(options) {
	if (currentStatus !== "ready") {
		return Promise.resolve().then(function () {
			throw new Error(
				"apply() is only allowed in ready status (state: " + currentStatus + ")"
			);
		});
	}
	return internalApply(options);
}

function internalApply(options) {
	options = options || {};
	applyInvalidatedModules();
	var results = currentUpdateApplyHandlers.map(function (handler) {
		return handler(options);
	});
	currentUpdateApplyHandlers = undefined;
	var errors = results
		.map(function (r) {
			return r.error;
		})
		.filter(Boolean);

	if (errors.length > 0) {
		return setStatus("abort").then(function () {
			throw errors[0];
		});
	}

	var disposePromise = setStatus("dispose");

	results.forEach(function (result) {
		if (result.dispose) result.dispose();
	});

	var applyPromise = setStatus("apply");

	var error;
	var reportError = function (err) {
		if (!error) error = err;
	};

	var outdatedModules = [];
	results.forEach(function (result) {
		if (result.apply) {
			var modules = result.apply(reportError);
			if (modules) {
				for (var i = 0; i < modules.length; i++) {
					outdatedModules.push(modules[i]);
				}
			}
		}
	});

	return Promise.all([disposePromise, applyPromise]).then(function () {
		if (error) {
			return setStatus("fail").then(function () {
				throw error;
			});
		}

		if (queuedInvalidatedModules) {
			return internalApply(options).then(function (list) {
				outdatedModules.forEach(function (moduleId) {
					if (list.indexOf(moduleId) < 0) list.push(moduleId);
				});
				return list;
			});
		}

		return setStatus("idle").then(function () {
			return outdatedModules;
		});
	});
}

function applyInvalidatedModules() {
	if (queuedInvalidatedModules) {
		if (!currentUpdateApplyHandlers) currentUpdateApplyHandlers = [];
		Object.keys(__webpack_require__.hmrI).forEach(function (key) {
			queuedInvalidatedModules.forEach(function (moduleId) {
				__webpack_require__.hmrI[key](moduleId, currentUpdateApplyHandlers);
			});
		});
		queuedInvalidatedModules = undefined;
		return true;
	}
}

})();
// webpack/runtime/load_script
(() => {
var inProgress = {};

var uniqueName = "f1-replay:";
// loadScript function to load a script via script tag
__webpack_require__.l = function (url, done, key, chunkId) {
	if (inProgress[url]) {
		inProgress[url].push(done);
		return;
	}
	var script, needAttach;
	if (key !== undefined) {
		var scripts = document.getElementsByTagName("script");
		for (var i = 0; i < scripts.length; i++) {
			var s = scripts[i];
			if (s.getAttribute("src") == url || s.getAttribute("data-rspack") == uniqueName + key) {
				script = s;
				break;
			}
		}
	}
	if (!script) {
		needAttach = true;
		script = document.createElement('script');


script.timeout = 120;
if (__webpack_require__.nc) {
  script.setAttribute("nonce", __webpack_require__.nc);
}

script.setAttribute("data-rspack", uniqueName + key);



script.src = url;


	}
	inProgress[url] = [done];
	var onScriptComplete = function (prev, event) {
		script.onerror = script.onload = null;
		clearTimeout(timeout);
		var doneFns = inProgress[url];
		delete inProgress[url];
		script.parentNode && script.parentNode.removeChild(script);
		doneFns &&
			doneFns.forEach(function (fn) {
				return fn(event);
			});
		if (prev) return prev(event);
	};
	var timeout = setTimeout(
		onScriptComplete.bind(null, undefined, {
			type: 'timeout',
			target: script
		}),
		120000
	);
	script.onerror = onScriptComplete.bind(null, script.onerror);
	script.onload = onScriptComplete.bind(null, script.onload);
	needAttach && document.head.appendChild(script);
};

})();
// webpack/runtime/make_namespace_object
(() => {
// define __esModule on exports
__webpack_require__.r = (exports) => {
	if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
	}
	Object.defineProperty(exports, '__esModule', { value: true });
};
})();
// webpack/runtime/node_module_decorator
(() => {
__webpack_require__.nmd = (module) => {
  module.paths = [];
  if (!module.children) module.children = [];
  return module;
};
})();
// webpack/runtime/on_chunk_loaded
(() => {
var deferred = [];
__webpack_require__.O = (result, chunkIds, fn, priority) => {
	if (chunkIds) {
		priority = priority || 0;
		for (var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--)
			deferred[i] = deferred[i - 1];
		deferred[i] = [chunkIds, fn, priority];
		return;
	}
	var notFulfilled = Infinity;
	for (var i = 0; i < deferred.length; i++) {
		var [chunkIds, fn, priority] = deferred[i];
		var fulfilled = true;
		for (var j = 0; j < chunkIds.length; j++) {
			if (
				(priority & (1 === 0) || notFulfilled >= priority) &&
				Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))
			) {
				chunkIds.splice(j--, 1);
			} else {
				fulfilled = false;
				if (priority < notFulfilled) notFulfilled = priority;
			}
		}
		if (fulfilled) {
			deferred.splice(i--, 1);
			var r = fn();
			if (r !== undefined) result = r;
		}
	}
	return result;
};

})();
// webpack/runtime/public_path
(() => {
__webpack_require__.p = "/";
})();
// webpack/runtime/css loading
(() => {
if (typeof document === "undefined") return;
var createStylesheet = function (
	chunkId, fullhref, oldTag, resolve, reject
) {
	var linkTag = document.createElement("link");

linkTag.rel = "stylesheet";

linkTag.type = "text/css";

if (__webpack_require__.nc) {
  linkTag.nonce = __webpack_require__.nc;
}
linkTag.href = fullhref;

	var onLinkComplete = function (event) {
		// avoid mem leaks.
		linkTag.onerror = linkTag.onload = null;
		if (event.type === 'load') {
			resolve();
		} else {
			var errorType = event && (event.type === 'load' ? 'missing' : event.type);
			var realHref = event && event.target && event.target.href || fullhref;
			var err = new Error("Loading CSS chunk " + chunkId + " failed.\\n(" + realHref + ")");
			err.code = "CSS_CHUNK_LOAD_FAILED";
			err.type = errorType;
			err.request = realHref;
			if (linkTag.parentNode) linkTag.parentNode.removeChild(linkTag)
			reject(err);
		}
	}
	linkTag.onerror = linkTag.onload = onLinkComplete;
	if (oldTag) {
            oldTag.parentNode.insertBefore(linkTag, oldTag.nextSibling);
          } else {
            document.head.appendChild(linkTag);
          }
	return linkTag;
}
var findStylesheet = function (href, fullhref) {
	var existingLinkTags = document.getElementsByTagName("link");
	for (var i = 0; i < existingLinkTags.length; i++) {
		var tag = existingLinkTags[i];
		var dataHref = tag.getAttribute("data-href") || tag.getAttribute("href");
		if (dataHref) {
			dataHref = dataHref.split('?')[0]
		}
		if (tag.rel === "stylesheet" && (dataHref === href || dataHref === fullhref)) return tag;
	}

	var existingStyleTags = document.getElementsByTagName("style");
	for (var i = 0; i < existingStyleTags.length; i++) {
		var tag = existingStyleTags[i];
		var dataHref = tag.getAttribute("data-href");
		if (dataHref === href || dataHref === fullhref) return tag;
	}
}

var loadStylesheet = function (chunkId) {
	return new Promise(function (resolve, reject) {
		var href = __webpack_require__.miniCssF(chunkId);
		var fullhref = __webpack_require__.p + href;
		if (findStylesheet(href, fullhref)) return resolve();
		createStylesheet(chunkId, fullhref, null, resolve, reject);
	})
}

// no chunk loading
var oldTags = [];
var newTags = [];
var applyHandler = function (options) {
	return {
		dispose: function () {
			for (var i = 0; i < oldTags.length; i++) {
				var oldTag = oldTags[i];
				if (oldTag.parentNode) oldTag.parentNode.removeChild(oldTag);
			}
			oldTags.length = 0;
		},
		apply: function () {
			for (var i = 0; i < newTags.length; i++) newTags[i].rel = "stylesheet";
			newTags.length = 0;
		}
	}
}
__webpack_require__.hmrC.miniCss = function (chunkIds, removedChunks, removedModules, promises, applyHandlers, updatedModulesList) {
	applyHandlers.push(applyHandler);
	chunkIds.forEach(function (chunkId) {
		var href = __webpack_require__.miniCssF(chunkId);
		var fullhref = __webpack_require__.p + href;
		var oldTag = findStylesheet(href, fullhref);
		if (!oldTag) return;
		promises.push(new Promise(function (resolve, reject) {
			var tag = createStylesheet(
				chunkId,

				/**
					If dynamically add link tag through dom API and there is already a loaded style link, browsers sometimes treats the new link tag as the same link, and won't fetch the new style.
					Use query to avoid browser cache the link tag, force to re-fetch new style, this is the same strategy as updateCss API, this can happen during lazy compilation
				 */
				`${fullhref}?${Date.now()}`,
				oldTag,
				function () {
					tag.as = "style";
					tag.rel = "preload";
					resolve();
				},
				reject
			);
			oldTags.push(oldTag);
			newTags.push(tag);
		}))
	});
}

// no prefetch
// no preload
})();
// webpack/runtime/jsonp_chunk_loading
(() => {

      // object to store loaded and loading chunks
      // undefined = chunk not loaded, null = chunk preloaded/prefetched
      // [resolve, reject, Promise] = chunk loading, 0 = chunk loaded
      var installedChunks = __webpack_require__.hmrS_jsonp = __webpack_require__.hmrS_jsonp || {"index": 0,};
      var currentUpdatedModulesList;
var waitingUpdateResolves = {};
function loadUpdateChunk(chunkId, updatedModulesList) {
	currentUpdatedModulesList = updatedModulesList;
	return new Promise((resolve, reject) => {
		waitingUpdateResolves[chunkId] = resolve;
		// start update chunk loading
		var url = __webpack_require__.p + __webpack_require__.hu(chunkId);
		// create error before stack unwound to get useful stacktrace later
		var error = new Error();
		var loadingEnded = (event) => {
			if (waitingUpdateResolves[chunkId]) {
				waitingUpdateResolves[chunkId] = undefined;
				var errorType =
					event && (event.type === 'load' ? 'missing' : event.type);
				var realSrc = event && event.target && event.target.src;
				error.message =
					'Loading hot update chunk ' +
					chunkId +
					' failed.\n(' +
					errorType +
					': ' +
					realSrc +
					')';
				error.name = 'ChunkLoadError';
				error.type = errorType;
				error.request = realSrc;
				reject(error);
			}
		};
		__webpack_require__.l(url, loadingEnded);
	});
}

self["webpackHotUpdatef1_replay"] = (chunkId, moreModules, runtime) => {
	for (var moduleId in moreModules) {
		if (__webpack_require__.o(moreModules, moduleId)) {
			currentUpdate[moduleId] = moreModules[moduleId];
			if (currentUpdatedModulesList) currentUpdatedModulesList.push(moduleId);
		}
	}
	if (runtime) currentUpdateRuntime.push(runtime);
	if (waitingUpdateResolves[chunkId]) {
		waitingUpdateResolves[chunkId]();
		waitingUpdateResolves[chunkId] = undefined;
	}
};
var currentUpdateChunks;
var currentUpdate;
var currentUpdateRemovedChunks;
var currentUpdateRuntime;
function applyHandler(options) {
	if (__webpack_require__.f) delete __webpack_require__.f.jsonpHmr;
	currentUpdateChunks = undefined;
	function getAffectedModuleEffects(updateModuleId) {
		var outdatedModules = [updateModuleId];
		var outdatedDependencies = {};
		var queue = outdatedModules.map(function (id) {
			return {
				chain: [id],
				id: id
			};
		});
		while (queue.length > 0) {
			var queueItem = queue.pop();
			var moduleId = queueItem.id;
			var chain = queueItem.chain;
			var module = __webpack_require__.c[moduleId];
			if (
				!module ||
				(module.hot._selfAccepted && !module.hot._selfInvalidated)
			) {
				continue;
			}

			if (module.hot._selfDeclined) {
				return {
					type: "self-declined",
					chain: chain,
					moduleId: moduleId
				};
			}

			if (module.hot._main) {
				return {
					type: "unaccepted",
					chain: chain,
					moduleId: moduleId
				};
			}

			for (var i = 0; i < module.parents.length; i++) {
				var parentId = module.parents[i];
				var parent = __webpack_require__.c[parentId];
				if (!parent) {
					continue;
				}
				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: "declined",
						chain: chain.concat([parentId]),
						moduleId: moduleId,
						parentId: parentId
					};
				}
				if (outdatedModules.indexOf(parentId) !== -1) {
					continue;
				}
				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) {
						outdatedDependencies[parentId] = [];
					}
					addAllToSet(outdatedDependencies[parentId], [moduleId]);
					continue;
				}
				delete outdatedDependencies[parentId];
				outdatedModules.push(parentId);
				queue.push({
					chain: chain.concat([parentId]),
					id: parentId
				});
			}
		}

		return {
			type: "accepted",
			moduleId: updateModuleId,
			outdatedModules: outdatedModules,
			outdatedDependencies: outdatedDependencies
		};
	}

	function addAllToSet(a, b) {
		for (var i = 0; i < b.length; i++) {
			var item = b[i];
			if (a.indexOf(item) === -1) a.push(item);
		}
	}

	var outdatedDependencies = {};
	var outdatedModules = [];
	var appliedUpdate = {};

	var warnUnexpectedRequire = function warnUnexpectedRequire(module) {
		console.warn(
			"[HMR] unexpected require(" + module.id + ") to disposed module"
		);
		throw Error("RuntimeError: factory is undefined(" + module.id + ")");
	};

	for (var moduleId in currentUpdate) {
		if (__webpack_require__.o(currentUpdate, moduleId)) {
			var newModuleFactory = currentUpdate[moduleId];
			var result = newModuleFactory ? getAffectedModuleEffects(moduleId) : {
				type: "disposed",
				moduleId: moduleId
			};
			var abortError = false;
			var doApply = false;
			var doDispose = false;
			var chainInfo = "";
			if (result.chain) {
				chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
			}
			switch (result.type) {
				case "self-declined":
					if (options.onDeclined) options.onDeclined(result);
					if (!options.ignoreDeclined)
						abortError = new Error(
							"Aborted because of self decline: " + result.moduleId + chainInfo
						);
					break;
				case "declined":
					if (options.onDeclined) options.onDeclined(result);
					if (!options.ignoreDeclined)
						abortError = new Error(
							"Aborted because of declined dependency: " +
							result.moduleId +
							" in " +
							result.parentId +
							chainInfo
						);
					break;
				case "unaccepted":
					if (options.onUnaccepted) options.onUnaccepted(result);
					if (!options.ignoreUnaccepted)
						abortError = new Error(
							"Aborted because " + moduleId + " is not accepted" + chainInfo
						);
					break;
				case "accepted":
					if (options.onAccepted) options.onAccepted(result);
					doApply = true;
					break;
				case "disposed":
					if (options.onDisposed) options.onDisposed(result);
					doDispose = true;
					break;
				default:
					throw new Error("Unexception type " + result.type);
			}
			if (abortError) {
				return {
					error: abortError
				};
			}
			if (doApply) {
				appliedUpdate[moduleId] = newModuleFactory;
				addAllToSet(outdatedModules, result.outdatedModules);
				for (moduleId in result.outdatedDependencies) {
					if (__webpack_require__.o(result.outdatedDependencies, moduleId)) {
						if (!outdatedDependencies[moduleId])
							outdatedDependencies[moduleId] = [];
						addAllToSet(
							outdatedDependencies[moduleId],
							result.outdatedDependencies[moduleId]
						);
					}
				}
			}
			if (doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}
	}
	currentUpdate = undefined;

	var outdatedSelfAcceptedModules = [];
	for (var j = 0; j < outdatedModules.length; j++) {
		var outdatedModuleId = outdatedModules[j];
		var module = __webpack_require__.c[outdatedModuleId];
		if (
			module &&
			(module.hot._selfAccepted || module.hot._main) &&
			// removed self-accepted modules should not be required
			appliedUpdate[outdatedModuleId] !== warnUnexpectedRequire &&
			// when called invalidate self-accepting is not possible
			!module.hot._selfInvalidated
		) {
			outdatedSelfAcceptedModules.push({
				module: outdatedModuleId,
				require: module.hot._requireSelf,
				errorHandler: module.hot._selfAccepted
			});
		}
	}
	

	var moduleOutdatedDependencies;
	return {
		dispose: function () {
			currentUpdateRemovedChunks.forEach(function (chunkId) {
				delete installedChunks[chunkId];
			});
			currentUpdateRemovedChunks = undefined;

			var idx;
			var queue = outdatedModules.slice();
			while (queue.length > 0) {
				var moduleId = queue.pop();
				var module = __webpack_require__.c[moduleId];
				if (!module) continue;

				var data = {};

				// Call dispose handlers
				var disposeHandlers = module.hot._disposeHandlers;
				
				for (j = 0; j < disposeHandlers.length; j++) {
					disposeHandlers[j].call(null, data);
				}
				__webpack_require__.hmrD[moduleId] = data;

				module.hot.active = false;

				delete __webpack_require__.c[moduleId];

				delete outdatedDependencies[moduleId];

				for (j = 0; j < module.children.length; j++) {
					var child = __webpack_require__.c[module.children[j]];
					if (!child) continue;
					idx = child.parents.indexOf(moduleId);
					if (idx >= 0) {
						child.parents.splice(idx, 1);
					}
				}
			}

			var dependency;
			for (var outdatedModuleId in outdatedDependencies) {
				if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
					module = __webpack_require__.c[outdatedModuleId];
					if (module) {
						moduleOutdatedDependencies = outdatedDependencies[outdatedModuleId];
						for (j = 0; j < moduleOutdatedDependencies.length; j++) {
							dependency = moduleOutdatedDependencies[j];
							idx = module.children.indexOf(dependency);
							if (idx >= 0) module.children.splice(idx, 1);
						}
					}
				}
			}
		},
		apply: function (reportError) {
			// insert new code
			for (var updateModuleId in appliedUpdate) {
				if (__webpack_require__.o(appliedUpdate, updateModuleId)) {
					__webpack_require__.m[updateModuleId] = appliedUpdate[updateModuleId];
					
				}
			}

			// run new runtime modules
			for (var i = 0; i < currentUpdateRuntime.length; i++) {
				
				currentUpdateRuntime[i](__webpack_require__);
				
			}

			// call accept handlers
			for (var outdatedModuleId in outdatedDependencies) {
				if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
					var module = __webpack_require__.c[outdatedModuleId];
					if (module) {
						moduleOutdatedDependencies = outdatedDependencies[outdatedModuleId];
						var callbacks = [];
						var errorHandlers = [];
						var dependenciesForCallbacks = [];
						for (var j = 0; j < moduleOutdatedDependencies.length; j++) {
							var dependency = moduleOutdatedDependencies[j];
							var acceptCallback = module.hot._acceptedDependencies[dependency];
							var errorHandler = module.hot._acceptedErrorHandlers[dependency];
							if (acceptCallback) {
								if (callbacks.indexOf(acceptCallback) !== -1) continue;
								callbacks.push(acceptCallback);
								errorHandlers.push(errorHandler);
								
								dependenciesForCallbacks.push(dependency);
							}
						}
						for (var k = 0; k < callbacks.length; k++) {
							try {
								callbacks[k].call(null, moduleOutdatedDependencies);
							} catch (err) {
								if (typeof errorHandlers[k] === "function") {
									try {
										errorHandlers[k](err, {
											moduleId: outdatedModuleId,
											dependencyId: dependenciesForCallbacks[k]
										});
									} catch (err2) {
										if (options.onErrored) {
											options.onErrored({
												type: "accept-error-handler-errored",
												moduleId: outdatedModuleId,
												dependencyId: dependenciesForCallbacks[k],
												error: err2,
												originalError: err
											});
										}
										if (!options.ignoreErrored) {
											reportError(err2);
											reportError(err);
										}
									}
								} else {
									if (options.onErrored) {
										options.onErrored({
											type: "accept-errored",
											moduleId: outdatedModuleId,
											dependencyId: dependenciesForCallbacks[k],
											error: err
										});
									}
									if (!options.ignoreErrored) {
										reportError(err);
									}
								}
							}
						}
					}
				}
			}

			// Load self accepted modules
			for (var o = 0; o < outdatedSelfAcceptedModules.length; o++) {
				var item = outdatedSelfAcceptedModules[o];
				var moduleId = item.module;
				try {
					item.require(moduleId);
				} catch (err) {
					if (typeof item.errorHandler === "function") {
						try {
							item.errorHandler(err, {
								moduleId: moduleId,
								module: __webpack_require__.c[moduleId]
							});
						} catch (err1) {
							if (options.onErrored) {
								options.onErrored({
									type: "self-accept-error-handler-errored",
									moduleId: moduleId,
									error: err1,
									originalError: err
								});
							}
							if (!options.ignoreErrored) {
								reportError(err1);
								reportError(err);
							}
						}
					} else {
						if (options.onErrored) {
							options.onErrored({
								type: "self-accept-errored",
								moduleId: moduleId,
								error: err
							});
						}
						if (!options.ignoreErrored) {
							reportError(err);
						}
					}
				}
			}

			return outdatedModules;
		}
	};
}

__webpack_require__.hmrI.jsonp = function (moduleId, applyHandlers) {
	if (!currentUpdate) {
		currentUpdate = {};
		currentUpdateRuntime = [];
		currentUpdateRemovedChunks = [];
		applyHandlers.push(applyHandler);
	}
	if (!__webpack_require__.o(currentUpdate, moduleId)) {
		currentUpdate[moduleId] = __webpack_require__.m[moduleId];
	}
};

__webpack_require__.hmrC.jsonp = function (
	chunkIds,
	removedChunks,
	removedModules,
	promises,
	applyHandlers,
	updatedModulesList
) {
	applyHandlers.push(applyHandler);
	currentUpdateChunks = {};
	currentUpdateRemovedChunks = removedChunks;
	currentUpdate = removedModules.reduce(function (obj, key) {
		obj[key] = false;
		return obj;
	}, {});
	currentUpdateRuntime = [];
	chunkIds.forEach(function (chunkId) {
		if (
			__webpack_require__.o(installedChunks, chunkId) &&
			installedChunks[chunkId] !== undefined
		) {
			promises.push(loadUpdateChunk(chunkId, updatedModulesList));
			currentUpdateChunks[chunkId] = true;
		} else {
			currentUpdateChunks[chunkId] = false;
		}
	});
	if (__webpack_require__.f) {
		__webpack_require__.f.jsonpHmr = function (chunkId, promises) {
			if (
				currentUpdateChunks &&
				__webpack_require__.o(currentUpdateChunks, chunkId) &&
				!currentUpdateChunks[chunkId]
			) {
				promises.push(loadUpdateChunk(chunkId));
				currentUpdateChunks[chunkId] = true;
			}
		};
	}
};
__webpack_require__.hmrM = () => {
	if (typeof fetch === "undefined")
		throw new Error("No browser support: need fetch API");
	return fetch(__webpack_require__.p + __webpack_require__.hmrF()).then(
		(response) => {
			if (response.status === 404) return; // no update available
			if (!response.ok)
				throw new Error(
					"Failed to fetch update manifest " + response.statusText
				);
			return response.json();
		}
	);
};
__webpack_require__.O.j = (chunkId) => (installedChunks[chunkId] === 0);
// install a JSONP callback for chunk loading
var __rspack_jsonp = (parentChunkLoadingFunction, data) => {
	var [chunkIds, moreModules, runtime] = data;
	// add "moreModules" to the modules object,
	// then flag all "chunkIds" as loaded and fire callback
	var moduleId, chunkId, i = 0;
	if (chunkIds.some((id) => (installedChunks[id] !== 0))) {
		for (moduleId in moreModules) {
			if (__webpack_require__.o(moreModules, moduleId)) {
				__webpack_require__.m[moduleId] = moreModules[moduleId];
			}
		}
		if (runtime) var result = runtime(__webpack_require__);
	}
	if (parentChunkLoadingFunction) parentChunkLoadingFunction(data);
	for (; i < chunkIds.length; i++) {
		chunkId = chunkIds[i];
		if (
			__webpack_require__.o(installedChunks, chunkId) &&
			installedChunks[chunkId]
		) {
			installedChunks[chunkId][0]();
		}
		installedChunks[chunkId] = 0;
	}
	
	return __webpack_require__.O(result);
	
};

var chunkLoadingGlobal = self["webpackChunkf1_replay"] = self["webpackChunkf1_replay"] || [];
chunkLoadingGlobal.forEach(__rspack_jsonp.bind(null, 0));
chunkLoadingGlobal.push = __rspack_jsonp.bind(null, chunkLoadingGlobal.push.bind(chunkLoadingGlobal));

})();
// module cache are used so entry inlining is disabled
// startup
// Load entry module and return exports
__webpack_require__.O(undefined, ["lib-react", "vendors-node_modules_rspack_core_dist_cssExtractHmr_js-node_modules_lucide-react_dist_esm_ico-43fe74"], () => __webpack_require__("./node_modules/@rspack/plugin-react-refresh/client/reactRefreshEntry.js"));
__webpack_require__.O(undefined, ["lib-react", "vendors-node_modules_rspack_core_dist_cssExtractHmr_js-node_modules_lucide-react_dist_esm_ico-43fe74"], () => __webpack_require__("data:text/javascript,import%20%7B%20init%20%7D%20from%20'%2FUsers%2Fwrick%2FProjects%2Ff1%2Fnode_modules%2F%40rsbuild%2Fcore%2Fdist%2Fclient%2Fhmr.js'%3B%0Aimport%20'%2FUsers%2Fwrick%2FProjects%2Ff1%2Fnode_modules%2F%40rsbuild%2Fcore%2Fdist%2Fclient%2Foverlay.js'%3B%0Ainit(%0A%20%20'b1f1e9ab6f1ef3f8'%2C%0A%20%20%7B%22path%22%3A%22%2Frsbuild-hmr%22%2C%22port%22%3A%22%22%2C%22host%22%3A%22%22%2C%22overlay%22%3Atrue%2C%22reconnect%22%3A100%2C%22logLevel%22%3A%22info%22%7D%2C%0A%20%20%22localhost%22%2C%0A%20%203001%2C%0A%20%20true%2C%0A%20%20true%2C%0A%20%20%22info%22%0A)%0A"));
var __webpack_exports__ = __webpack_require__.O(undefined, ["lib-react", "vendors-node_modules_rspack_core_dist_cssExtractHmr_js-node_modules_lucide-react_dist_esm_ico-43fe74"], () => __webpack_require__("./src/index.tsx"));
__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
})()
;
//# sourceMappingURL=index.js.map