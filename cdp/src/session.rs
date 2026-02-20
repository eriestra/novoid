use chromiumoxide::browser::Browser;
use chromiumoxide::page::Page;

/// Create a new page (tab) in the browser.
pub async fn new_page(browser: &Browser) -> Result<Page, Box<dyn std::error::Error>> {
    let page = browser.new_page("about:blank").await?;
    Ok(page)
}
