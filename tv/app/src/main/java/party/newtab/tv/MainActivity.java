package party.newtab.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * newtab.party for Google TV.
 *
 * A full-screen WebView on https://newtab.party plus a remote-control layer, so a
 * Bluetooth (or stock) TV remote can play the daily game. Two input modes:
 *
 *  - Remote mode: the arrows reach the game as arrow keys, and OK sends Enter + Space
 *    (Enter starts/restarts from a game's title and game-over screens, Space is the
 *    action button). Picked automatically for games whose controls mention arrows/WASD.
 *  - Pointer mode: the arrows move an on-screen cursor and OK taps (hold OK to drag
 *    or long-press). Picked automatically for click/tap games and non-game pages.
 *
 * Hold Back (or press Menu, Play/Pause, Info, or gamepad Y/Select) to switch modes.
 * The choice is remembered per game. Back closes the arcade's overlays, then goes back
 * in history, then asks for a second press before exiting.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://newtab.party/";
    private static final int BG = 0xFF080810;
    private static final long BACK_HOLD_MS = 600;
    private static final long EXIT_WINDOW_MS = 2000;
    private static final long HINT_MS = 3500;

    /** Injected after every page load: reports which game is on screen and where focus is. */
    private static final String INJECT =
        "(function(){" +
        "if(window.__ntv)return;window.__ntv=1;" +
        "function rep(){var a=document.activeElement;" +
        " NewtabTV.onFocus(!!a&&a.id==='game-frame',a?a.tagName:'');}" +
        "document.addEventListener('focusin',rep,true);" +
        "document.addEventListener('focusout',function(){setTimeout(rep,0)},true);" +
        "window.addEventListener('blur',function(){setTimeout(rep,0)});" +
        "rep();" +
        "var tries=0;(function poll(){" +
        " var f=document.getElementById('game-frame');" +
        " if(!f){NewtabTV.onGame('','');return;}" +
        " var m=(f.getAttribute('src')||'').match(/\\/games\\/([^\\/?#]+)\\.html/);" +
        " if(!m){if(++tries<40)setTimeout(poll,250);else NewtabTV.onGame('','');return;}" +
        " fetch('/games.json').then(function(r){return r.json()}).then(function(d){" +
        "  var g=(d.games||[]).filter(function(x){return x.id===m[1]})[0];" +
        "  NewtabTV.onGame(m[1],(g&&g.controls)||'');" +
        " }).catch(function(){NewtabTV.onGame(m[1],'')});" +
        "})();" +
        "})();";

    private static final String FOCUS_GAME =
        "try{typeof focusGame==='function'&&focusGame()}catch(e){}";

    /** Closes whichever arcade overlay is open. Returns 1 if it closed one. */
    private static final String CLOSE_OVERLAY =
        "(function(){try{" +
        "var a=document.getElementById('about-overlay'),n=document.getElementById('name-overlay');" +
        "if(a&&a.classList.contains('open')){closeAbout();" + FOCUS_GAME + "return 1}" +
        "if(n&&n.classList.contains('open')){skipName();" + FOCUS_GAME + "return 1}" +
        "if(typeof scoresOverlay!=='undefined'&&scoresOverlay.classList.contains('open')){closeScores();return 1}" +
        "}catch(e){}return 0})()";

    private static final String OFFLINE_HTML =
        "<html><body style=\"background:#080810;color:rgba(255,255,255,.55);font-family:sans-serif;" +
        "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center\">" +
        "<div><p style=\"font-size:22px;letter-spacing:3px;text-transform:uppercase\">No connection</p>" +
        "<p style=\"font-size:16px;margin-top:12px\">Check your internet, then press OK to try again.</p></div>" +
        "</body></html>";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;
    private ImageView cursor;
    private TextView hint;
    private SharedPreferences prefs;

    private boolean pointerMode;
    private String gameId = "";
    private boolean focusInGame;
    private String focusTag = "";
    private boolean offline;

    // Pointer mode state. Cursor position is in WebView pixels; cx < 0 means "not placed yet".
    private float cx = -1, cy = -1;
    private int heldDx, heldDy;
    private long moveStartMs;
    private boolean moveLoopRunning;
    private boolean pointerDown;
    private long pointerDownTime;

    // Back button state.
    private long backDownAt;
    private boolean backToggled;
    private long exitPromptAt;

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("modes", Context.MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        cursor = new ImageView(this);
        cursor.setImageResource(R.drawable.cursor);
        cursor.setVisibility(View.GONE);
        cursor.setElevation(dp(8));
        root.addView(cursor, new FrameLayout.LayoutParams(dp(32), dp(32)));

        hint = new TextView(this);
        hint.setTextColor(0xFFE5E7EB);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        hint.setPadding(dp(20), dp(12), dp(20), dp(12));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(0xEE1A1A28);
        pill.setCornerRadius(dp(24));
        pill.setStroke(dp(1), 0x33FFFFFF);
        hint.setBackground(pill);
        hint.setElevation(dp(10));
        hint.setAlpha(0f);
        FrameLayout.LayoutParams hlp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        hlp.bottomMargin = dp(36);
        root.addView(hint, hlp);

        setContentView(root);
        setUpWebView();

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
        web.requestFocus();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setUpWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " NewtabPartyTV/1.0");

        web.setBackgroundColor(BG);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(), "NewtabTV");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // Most TVs have no browser, so every link stays in the app. Back returns.
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (url != null && url.startsWith("http")) offline = false;
                focusInGame = false;
                focusTag = "";
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!offline) view.evaluateJavascript(INJECT, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    offline = true;
                    setMode(false, null);
                    view.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "utf-8", null);
                }
            }
        });
    }

    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override protected void onPause() {
        releasePointer();
        heldDx = heldDy = 0;
        web.onPause();
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- JS bridge

    public final class Bridge {
        @JavascriptInterface
        public void onGame(String id, String controls) {
            ui.post(() -> gameDetected(id == null ? "" : id, controls == null ? "" : controls));
        }

        @JavascriptInterface
        public void onFocus(boolean inGame, String tag) {
            ui.post(() -> {
                focusInGame = inGame;
                focusTag = tag == null ? "" : tag;
            });
        }
    }

    private void gameDetected(String id, String controls) {
        boolean firstLook = !id.equals(gameId);
        gameId = id;
        boolean pointer;
        if (id.isEmpty()) {
            pointer = true;
        } else if (prefs.contains(id)) {
            pointer = prefs.getBoolean(id, false);
        } else {
            pointer = !wantsArrowKeys(controls);
        }
        if (pointer != pointerMode || firstLook) setMode(pointer, id.isEmpty() ? null : modeHint(pointer));
    }

    /** Arrow-key games play in remote mode; click/tap-only games get the pointer. */
    static boolean wantsArrowKeys(String controls) {
        String c = controls.toLowerCase();
        return c.contains("←") || c.contains("→") || c.contains("↑") || c.contains("↓")
            || c.contains("arrow") || c.contains("wasd") || c.contains("d-pad")
            || c.contains("a/d") || c.contains("a / d") || c.contains("a·d");
    }

    private static String modeHint(boolean pointer) {
        return pointer
            ? "Pointer mode: arrows move, OK clicks. Hold Back to switch."
            : "Remote mode: arrows play, OK is the action button. Hold Back to switch.";
    }

    // ---------------------------------------------------------------- modes

    private void setMode(boolean pointer, String message) {
        pointerMode = pointer;
        if (pointer) {
            if (cx < 0 && web.getWidth() > 0) {
                cx = web.getWidth() / 2f;
                cy = web.getHeight() / 2f;
            }
            placeCursor();
            cursor.setVisibility(cx < 0 || offline ? View.GONE : View.VISIBLE);
        } else {
            releasePointer();
            heldDx = heldDy = 0;
            cursor.setVisibility(View.GONE);
            refocusGame();
        }
        if (message != null) showHint(message);
    }

    private void toggleMode() {
        if (offline) return;
        boolean pointer = !pointerMode;
        if (!gameId.isEmpty()) prefs.edit().putBoolean(gameId, pointer).apply();
        setMode(pointer, modeHint(pointer));
    }

    private void refocusGame() {
        web.requestFocus();
        web.evaluateJavascript(FOCUS_GAME, null);
    }

    // ---------------------------------------------------------------- keys

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();

        if (isBack(code)) return handleBack(e);

        if (isToggle(code)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) toggleMode();
            return true;
        }

        if (offline) {
            if (isOk(code)) {
                if (e.getAction() == KeyEvent.ACTION_UP) web.loadUrl(HOME);
                return true;
            }
            return super.dispatchKeyEvent(e);
        }

        if (pointerMode && (isArrow(code) || isOk(code))) return handlePointerKey(e);

        if (!pointerMode) {
            boolean nothingFocused = focusTag.isEmpty() || "BODY".equals(focusTag) || "HTML".equals(focusTag);
            if (isOk(code)) {
                if (!focusInGame) {
                    if ("INPUT".equals(focusTag) || "TEXTAREA".equals(focusTag)) {
                        if (e.getAction() == KeyEvent.ACTION_UP) showKeyboard();
                        return true;
                    }
                    // A page button has focus: let OK press it.
                    if (!nothingFocused) return super.dispatchKeyEvent(e);
                    refocusGame();
                }
                sendOkToGame(e);
                return true;
            }
            if (isArrow(code) && !focusInGame && nothingFocused
                && e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                refocusGame();
            }
        }
        return super.dispatchKeyEvent(e);
    }

    /** OK in remote mode: Enter (title/game-over screens) plus Space (the action button). */
    private void sendOkToGame(KeyEvent e) {
        long down = e.getDownTime();
        long now = e.getEventTime();
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            if (e.getRepeatCount() == 0) {
                web.dispatchKeyEvent(new KeyEvent(down, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER, 0));
            }
            web.dispatchKeyEvent(new KeyEvent(down, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, e.getRepeatCount()));
        } else if (e.getAction() == KeyEvent.ACTION_UP) {
            web.dispatchKeyEvent(new KeyEvent(down, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE, 0));
            web.dispatchKeyEvent(new KeyEvent(down, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER, 0));
        }
    }

    private boolean handleBack(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            if (e.getRepeatCount() == 0) {
                backDownAt = e.getDownTime();
                backToggled = false;
            } else if (!backToggled && e.getEventTime() - backDownAt >= BACK_HOLD_MS) {
                backToggled = true;
                toggleMode();
            }
            return true;
        }
        if (e.getAction() == KeyEvent.ACTION_UP) {
            if (backToggled) {
                backToggled = false;
            } else if (e.getEventTime() - backDownAt >= BACK_HOLD_MS) {
                // Remotes that don't auto-repeat still get the hold gesture.
                toggleMode();
            } else if (!e.isCanceled()) {
                goBack();
            }
        }
        return true;
    }

    private void goBack() {
        releasePointer();
        if (offline) { finishWithPrompt(); return; }
        web.evaluateJavascript(CLOSE_OVERLAY, closed -> {
            if ("1".equals(closed)) return;
            if (web.canGoBack()) web.goBack();
            else finishWithPrompt();
        });
    }

    private void finishWithPrompt() {
        long now = SystemClock.uptimeMillis();
        if (now - exitPromptAt < EXIT_WINDOW_MS) {
            finish();
        } else {
            exitPromptAt = now;
            showHint("Press Back again to exit");
        }
    }

    private void showKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        web.requestFocus();
        if (imm != null) imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
    }

    private static boolean isArrow(int c) {
        return c == KeyEvent.KEYCODE_DPAD_UP || c == KeyEvent.KEYCODE_DPAD_DOWN
            || c == KeyEvent.KEYCODE_DPAD_LEFT || c == KeyEvent.KEYCODE_DPAD_RIGHT;
    }

    private static boolean isOk(int c) {
        return c == KeyEvent.KEYCODE_DPAD_CENTER || c == KeyEvent.KEYCODE_ENTER
            || c == KeyEvent.KEYCODE_NUMPAD_ENTER || c == KeyEvent.KEYCODE_BUTTON_A;
    }

    private static boolean isBack(int c) {
        return c == KeyEvent.KEYCODE_BACK || c == KeyEvent.KEYCODE_ESCAPE || c == KeyEvent.KEYCODE_BUTTON_B;
    }

    private static boolean isToggle(int c) {
        return c == KeyEvent.KEYCODE_MENU || c == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            || c == KeyEvent.KEYCODE_MEDIA_PLAY || c == KeyEvent.KEYCODE_INFO
            || c == KeyEvent.KEYCODE_BUTTON_Y || c == KeyEvent.KEYCODE_BUTTON_SELECT;
    }

    // ---------------------------------------------------------------- pointer mode

    private boolean handlePointerKey(KeyEvent e) {
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;

        if (cursor.getVisibility() != View.VISIBLE) {
            if (cx < 0) { cx = web.getWidth() / 2f; cy = web.getHeight() / 2f; }
            placeCursor();
            cursor.setVisibility(View.VISIBLE);
        }

        if (isArrow(code)) {
            int dx = code == KeyEvent.KEYCODE_DPAD_LEFT ? -1 : code == KeyEvent.KEYCODE_DPAD_RIGHT ? 1 : 0;
            int dy = code == KeyEvent.KEYCODE_DPAD_UP ? -1 : code == KeyEvent.KEYCODE_DPAD_DOWN ? 1 : 0;
            if (down) {
                if (e.getRepeatCount() == 0) {
                    boolean wasIdle = heldDx == 0 && heldDy == 0;
                    if (dx != 0) heldDx = dx;
                    if (dy != 0) heldDy = dy;
                    if (wasIdle) {
                        moveStartMs = SystemClock.uptimeMillis();
                        moveBy(dx * dp(10), dy * dp(10));   // a tap is a small nudge
                    }
                    if (!moveLoopRunning) {
                        moveLoopRunning = true;
                        cursor.postOnAnimation(moveTick);
                    }
                }
            } else {
                if (dx != 0 && heldDx == dx) heldDx = 0;
                if (dy != 0 && heldDy == dy) heldDy = 0;
            }
            return true;
        }

        // OK: touch down on press, up on release, so holding OK drags or long-presses.
        if (down && e.getRepeatCount() == 0) pressPointer();
        else if (!down) releasePointer();
        return true;
    }

    private final Runnable moveTick = new Runnable() {
        @Override public void run() {
            if (heldDx == 0 && heldDy == 0) { moveLoopRunning = false; return; }
            long held = SystemClock.uptimeMillis() - moveStartMs;
            if (held > 200) {
                float ramp = Math.min(1f, (held - 200) / 800f);
                float speed = dp(3) + ramp * dp(15);   // px per frame, accelerating
                moveBy(heldDx * speed, heldDy * speed);
            }
            cursor.postOnAnimation(this);
        }
    };

    private void moveBy(float dx, float dy) {
        float w = web.getWidth(), h = web.getHeight();
        if (w <= 0 || h <= 0) return;
        float tx = cx + dx, ty = cy + dy;
        // Pushing past the top or bottom edge scrolls the page.
        float overflow = ty < 0 ? ty : ty > h - 1 ? ty - (h - 1) : 0;
        if (overflow != 0) {
            float css = overflow / getResources().getDisplayMetrics().density;
            web.evaluateJavascript("window.scrollBy(0," + Math.round(css) + ")", null);
        }
        cx = Math.max(0, Math.min(w - 1, tx));
        cy = Math.max(0, Math.min(h - 1, ty));
        placeCursor();
        if (pointerDown) sendTouch(MotionEvent.ACTION_MOVE);
    }

    private void placeCursor() {
        // The arrow's tip sits 2dp in from the drawable's corner.
        cursor.setTranslationX(cx - dp(2));
        cursor.setTranslationY(cy - dp(2));
    }

    private void pressPointer() {
        if (pointerDown) return;
        pointerDown = true;
        pointerDownTime = SystemClock.uptimeMillis();
        sendTouch(MotionEvent.ACTION_DOWN);
        cursor.setScaleX(0.85f);
        cursor.setScaleY(0.85f);
    }

    private void releasePointer() {
        if (!pointerDown) return;
        sendTouch(MotionEvent.ACTION_UP);
        pointerDown = false;
        cursor.setScaleX(1f);
        cursor.setScaleY(1f);
    }

    private void sendTouch(int action) {
        MotionEvent.PointerProperties pp = new MotionEvent.PointerProperties();
        pp.id = 0;
        pp.toolType = MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords pc = new MotionEvent.PointerCoords();
        pc.x = cx;
        pc.y = cy;
        pc.pressure = 1f;
        pc.size = 1f;
        MotionEvent ev = MotionEvent.obtain(pointerDownTime, SystemClock.uptimeMillis(), action, 1,
            new MotionEvent.PointerProperties[] { pp }, new MotionEvent.PointerCoords[] { pc },
            0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        web.dispatchTouchEvent(ev);
        ev.recycle();
    }

    /** Air-mouse remotes drive the WebView directly; hide the virtual cursor while they do. */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (ev.isFromSource(InputDevice.SOURCE_MOUSE)) {
            cx = ev.getX();
            cy = ev.getY();
            cursor.setVisibility(View.GONE);
        }
        return super.dispatchGenericMotionEvent(ev);
    }

    // ---------------------------------------------------------------- hint toast

    private final Runnable hideHint = () -> hint.animate().alpha(0f).setDuration(250).start();

    private void showHint(String text) {
        hint.setText(text);
        hint.animate().alpha(1f).setDuration(150).start();
        ui.removeCallbacks(hideHint);
        ui.postDelayed(hideHint, HINT_MS);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
            getResources().getDisplayMetrics()));
    }
}
