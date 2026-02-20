use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::handler::Handler;

/// Launch a new headless Chrome or attach to an existing instance on `port`.
pub async fn connect(
    headless: bool,
    port: Option<u16>,
) -> Result<(Browser, Handler), Box<dyn std::error::Error>> {
    if let Some(p) = port {
        // Attach to existing Chrome on the given port
        let url = format!("http://127.0.0.1:{p}");
        let (browser, handler) = Browser::connect(&url).await?;
        Ok((browser, handler))
    } else {
        // Launch a new Chrome instance
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
        let (browser, handler) = Browser::launch(config).await?;

        // The handler must be polled — wrap it so the caller can spawn it
        Ok((browser, handler))
    }
}
