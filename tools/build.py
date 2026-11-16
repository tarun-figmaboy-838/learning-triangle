"""Builds the page's two files in dist/ from the sources:

  dist/app.js    the ES modules of js/ (entry js/main.js) as one classic script, minified
  dist/app.css   the stylesheets of styles/ in cascade order, minified

Why one classic script: browsers refuse ES modules from file://, and the lesson must open with a double-click
on index.html. Each module keeps its own function scope; the bundler understands the project's import/export
forms (named imports, `export const|let|function|async function|class`). Minifying removes comments,
indentation and blank lines but keeps line breaks, so semicolon insertion can never change the code's meaning.

Run after editing anything in js/ or styles/:   python3 tools/build.py
(it also stamps index.html's links with the build time, so a browser never shows a stale build)
"""
import os
import posixpath
import re
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENTRY = "js/main.js"
JS_OUT = "dist/app.js"
CSS_OUT = "dist/app.css"
STYLES = ["tokens", "base", "layout", "components", "gameplay", "animations", "learning", "responsive"]

IMPORT_RE = re.compile(r"^\s*import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"];?\s*$", re.M | re.S)
EXPORT_DECL_RE = re.compile(r"^export\s+(const|let|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)", re.M)


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        return handle.read()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as handle:
        handle.write(text)


# ---------- Bundling ----------

def resolve(from_path, specifier):
    if not specifier.startswith("."):
        raise SystemExit(f"{from_path}: only relative imports are supported ({specifier})")
    return posixpath.normpath(posixpath.join(posixpath.dirname(from_path), specifier))


def transform(path, source):
    dependencies = []

    def replace_import(match):
        names, specifier = match.group(1), match.group(2)
        target = resolve(path, specifier)
        dependencies.append(target)
        bindings = []
        for part in names.split(","):
            part = part.strip()
            if not part:
                continue
            original, _, alias = (piece.strip() for piece in part.partition(" as "))
            bindings.append(f"{original}: {alias}" if alias else original)
        return f"const {{ {', '.join(bindings)} }} = __require({target!r});"

    body = IMPORT_RE.sub(replace_import, source)
    exported = []

    def replace_export(match):
        exported.append(match.group(2))
        return f"{match.group(1)} {match.group(2)}"

    body = EXPORT_DECL_RE.sub(replace_export, body)
    if re.search(r"^\s*export\s", body, re.M):
        raise SystemExit(f"{path}: unsupported export form")
    footer = f"\n  return {{ {', '.join(exported)} }};" if exported else ""
    return f"__define({path!r}, function () {{\n{body.rstrip()}{footer}\n}});\n", dependencies


def collect(entry):
    order, seen, visiting = [], set(), set()

    def visit(path):
        if path in seen:
            return
        if path in visiting:
            raise SystemExit(f"circular import through {path}")
        visiting.add(path)
        wrapped, dependencies = transform(path, read(path))
        for dependency in dependencies:
            visit(dependency)
        visiting.discard(path)
        seen.add(path)
        order.append(wrapped)

    visit(entry)
    return order


PRELUDE = """(function () {
'use strict';
const __factories = new Map();
const __cache = new Map();
function __define(path, factory) { __factories.set(path, factory); }
function __require(path) {
  if (!__cache.has(path)) {
    const factory = __factories.get(path);
    if (!factory) throw new Error('Module not bundled: ' + path);
    __cache.set(path, factory());
  }
  return __cache.get(path);
}
"""


# ---------- Minifying ----------

# After these, a `/` starts a regular expression rather than a division.
REGEX_AFTER_CHARS = set("(,=:[!&|?{};+-*%<>~^")
REGEX_AFTER_WORDS = {"return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"}


def minify_js(source):
    """Drops comments, indentation, trailing spaces and blank lines; strings, templates and regexes stay verbatim."""
    out = []                # output characters
    i, n = 0, len(source)
    braces = []             # for each open `${`: the brace depth to return to the template at
    depth = 0
    last = ""               # the last significant code character (for regex detection)
    word = ""               # the last identifier / keyword

    def emit_space():
        if out and out[-1] not in (" ", "\n"):
            out.append(" ")

    def read_template(start):
        """Copies a template literal from `start` (just after a backtick or `}`) until its end or a `${`."""
        nonlocal i
        j = start
        while j < n:
            c = source[j]
            if c == "\\":
                j += 2
                continue
            if c == "`":
                out.append(source[start:j + 1])
                i = j + 1
                return False
            if c == "$" and j + 1 < n and source[j + 1] == "{":
                out.append(source[start:j + 2])
                i = j + 2
                return True
            j += 1
        raise SystemExit("unterminated template literal")

    while i < n:
        c = source[i]
        if c in " \t\r":
            emit_space()
            i += 1
            continue
        if c == "\n":
            while out and out[-1] == " ":
                out.pop()
            if out and out[-1] != "\n":
                out.append("\n")
            i += 1
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "/":
            while i < n and source[i] != "\n":
                i += 1
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "*":
            end = source.find("*/", i + 2)
            if end < 0:
                raise SystemExit("unterminated block comment")
            emit_space()
            i = end + 2
            continue
        if c in "'\"":
            j = i + 1
            while source[j] != c:
                j += 2 if source[j] == "\\" else 1
            out.append(source[i:j + 1])
            i = j + 1
            last, word = c, ""
            continue
        if c == "`":
            out.append("`")
            if read_template(i + 1):
                braces.append(depth)
                depth += 1
            last, word = "`", ""
            continue
        if c == "/" and (last in REGEX_AFTER_CHARS or last == "" or word in REGEX_AFTER_WORDS):
            j, in_class = i + 1, False
            while True:
                ch = source[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
                elif ch == "\n":
                    raise SystemExit(f"could not read a regular expression near: {source[i:i + 40]!r}")
                j += 1
            j += 1
            while j < n and (source[j].isalnum() or source[j] == "_"):
                j += 1
            out.append(source[i:j])
            i = j
            last, word = "/", ""
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if braces and depth == braces[-1]:
                braces.pop()
                out.append("}")
                if read_template(i + 1):
                    braces.append(depth)
                    depth += 1
                last, word = "`", ""
                continue
        if c.isalnum() or c in "_$":
            j = i
            while j < n and (source[j].isalnum() or source[j] in "_$"):
                j += 1
            word = source[i:j]
            out.append(word)
            last = word[-1]
            i = j
            continue
        out.append(c)
        last, word = c, ""
        i += 1
    return "".join(out).strip() + "\n"


def minify_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    return css.strip() + "\n"


# ---------- Build ----------

def build():
    modules = collect(ENTRY)
    bundle = PRELUDE + "".join(modules) + f"__require({ENTRY!r});\n}})();\n"
    js = "/* Built by tools/build.py from js/ (entry js/main.js). Do not edit. */\n" + minify_js(bundle)
    write(JS_OUT, js)
    css = "\n".join(read(f"styles/{name}.css") for name in STYLES)
    write(CSS_OUT, "/* Built by tools/build.py from styles/. Do not edit. */\n" + minify_css(css))
    print(f"{JS_OUT}: {len(modules)} modules, {len(bundle) / 1024:.0f} KB -> {len(js) / 1024:.0f} KB")
    print(f"{CSS_OUT}: {len(STYLES)} stylesheets, {len(css) / 1024:.0f} KB -> {os.path.getsize(os.path.join(ROOT, CSS_OUT)) / 1024:.0f} KB")


def stamp_page(path="index.html"):
    """Stamps the page's links to dist/ with this build's time, so a browser never shows an old build."""
    stamp = str(int(time.time()))
    html = read(path)
    html = re.sub(r'((?:src|href)="dist/app\.(?:js|css))(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={stamp}"', html)
    write(path, html)


if __name__ == "__main__":
    build()
    stamp_page()
    sys.exit(0)
