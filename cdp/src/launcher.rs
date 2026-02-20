use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::handler::Handler;
use std::time::Duration;

const LAUNCH_TIMEOUT: Duration = Duration::from_secs(10);

/// Launch a new headless Chrome or attach to an existing instance on `port`.
/// Times out after 10 seconds to prevent hanging.
pub async fn connect(
    headless: bool,
    port: Option<u16>,
) -> Result<(Browser, Handler), Box<dyn std::error::Error>> {
    if let Some(p) = port {
        let url = format!("http://127.0.0.1:{p}");
        let (browser, handler) = tokio::time::timeout(LAUNCH_TIMEOUT, Browser::connect(&url))
            .await
            .map_err(|_| format!("Timeout connecting to Chrome on port {p}"))??;
        Ok((browser, handler))
    } else {
        let mut builder = BrowserConfig::builder();
        if headless {
            builder = builder.arg("--headless=new");
        }
        builder = builder
            .arg("--disable-gpu")
            .arg("--no-sandbox")
            .arg("--disable-dev-shm-usage")
            .arg("--disable-extensions")
            .window_size(1440, 900);

        let config = builder.build().map_err(|e| format!("Browser config error: {e}"))?;
        let (browser, handler) = tokio::time::timeout(LAUNCH_TIMEOUT, Browser::launch(config))
            .await
            .map_err(|_| "Timeout launching Chrome (10s). Is Chrome/Chromium installed?".to_string())??;
        Ok((browser, handler))
    }
}
