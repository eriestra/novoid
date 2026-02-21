use scraper::{Html, Selector};

/// Extracted script info from an HTML file
#[derive(Debug)]
pub struct ParsedPage {
    /// External script src references (relative or absolute paths)
    pub script_srcs: Vec<String>,
    /// Inline script contents
    pub inline_scripts: Vec<String>,
    /// External stylesheet hrefs
    pub stylesheet_hrefs: Vec<String>,
    /// Whether this page references novoid (core.js or novoid.min.js)
    pub is_novoid_app: bool,
    /// Title if present
    pub title: Option<String>,
    /// Body element IDs and structure for DOM setup
    pub body_elements: Vec<BodyElement>,
}

/// A non-script element found in <body>
#[derive(Debug)]
pub struct BodyElement {
    pub tag: String,
    pub id: Option<String>,
    pub class: Option<String>,
}

/// Parse an HTML file and extract script blocks and metadata
pub fn parse_html(html: &str) -> ParsedPage {
    let document = Html::parse_document(html);

    let script_sel = Selector::parse("script").unwrap();
    let link_sel = Selector::parse("link[rel='stylesheet']").unwrap();
    let title_sel = Selector::parse("title").unwrap();

    let mut script_srcs = Vec::new();
    let mut inline_scripts = Vec::new();
    let mut stylesheet_hrefs = Vec::new();
    let mut is_novoid_app = false;

    for el in document.select(&script_sel) {
        if let Some(src) = el.value().attr("src") {
            let src_str = src.to_string();
            if src_str.contains("core.min.js")
                || src_str.contains("core.js")
                || src_str.contains("novoid.min.js")
                || src_str.contains("novoid.js")
            {
                is_novoid_app = true;
            }
            script_srcs.push(src_str);
        } else {
            // Skip non-JS script types (e.g. application/json, application/ld+json)
            if let Some(script_type) = el.value().attr("type") {
                let t = script_type.trim().to_lowercase();
                if t != "text/javascript" && t != "module" && t != "" {
                    continue;
                }
            }
            let text: String = el.text().collect();
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                inline_scripts.push(trimmed.to_string());
                // Check if inline script references Novoid
                if trimmed.contains("Novoid.") {
                    is_novoid_app = true;
                }
            }
        }
    }

    for el in document.select(&link_sel) {
        if let Some(href) = el.value().attr("href") {
            stylesheet_hrefs.push(href.to_string());
        }
    }

    let title = document
        .select(&title_sel)
        .next()
        .map(|el| el.text().collect::<String>());

    // Extract non-script body elements (divs, etc.) for DOM setup
    let body_sel = Selector::parse("body > *:not(script)").unwrap();
    let mut body_elements = Vec::new();
    for el in document.select(&body_sel) {
        let tag = el.value().name().to_string();
        let id = el.value().attr("id").map(String::from);
        let class = el.value().attr("class").map(String::from);
        body_elements.push(BodyElement { tag, id, class });
    }

    ParsedPage {
        script_srcs,
        inline_scripts,
        stylesheet_hrefs,
        is_novoid_app,
        title,
        body_elements,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_novoid_app() {
        let html = r#"<!DOCTYPE html>
<html>
<head>
    <title>Test App</title>
    <link rel="stylesheet" href="../css/core.min.css">
    <script src="../js/core.min.js"></script>
    <script src="../js/router.min.js"></script>
</head>
<body>
    <div id="app"></div>
    <script>
        const [count, setCount] = Novoid.signal(0);
        Novoid.mount('#app', () => Novoid.h('div', {}, () => count()));
    </script>
</body>
</html>"#;

        let parsed = parse_html(html);
        assert!(parsed.is_novoid_app);
        assert_eq!(parsed.script_srcs.len(), 2);
        assert_eq!(parsed.inline_scripts.len(), 1);
        assert_eq!(parsed.title, Some("Test App".to_string()));
        assert!(parsed.inline_scripts[0].contains("Novoid.signal"));
    }

    #[test]
    fn test_skip_non_js_script_types() {
        let html = r#"<html><head>
            <script type="application/json" data-contracts>[{"name":"test"}]</script>
            <script src="core.min.js"></script>
        </head><body>
            <script>Novoid.signal(0);</script>
        </body></html>"#;
        let parsed = parse_html(html);
        assert!(parsed.is_novoid_app);
        assert_eq!(parsed.inline_scripts.len(), 1);
        assert!(parsed.inline_scripts[0].contains("Novoid.signal"));
    }

    #[test]
    fn test_parse_non_novoid() {
        let html = r#"<html><body><script>console.log("hello")</script></body></html>"#;
        let parsed = parse_html(html);
        assert!(!parsed.is_novoid_app);
        assert_eq!(parsed.inline_scripts.len(), 1);
    }
}
