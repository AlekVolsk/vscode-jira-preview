/**
 * The part of the highlight.js API that `out/` uses. It stands in for the JSDoc of
 * `core.js`, which refers to types of the full `highlight.js` package that is not
 * vendored, so the type check reads this file instead of the vendored source.
 */
declare namespace hljs {
    interface HighlightOptions {
        language: string;
        ignoreIllegals?: boolean;
    }

    interface HighlightResult {
        code?: string;
        language?: string;
        relevance: number;
        value: string;
        illegal: boolean;
    }

    interface Language {
        name?: string;
        aliases?: string[];
        case_insensitive?: boolean;
        disableAutodetect?: boolean;
    }

    type LanguageFn = (api: HLJSApi) => Language;

    interface HLJSApi {
        highlight(code: string, options: HighlightOptions): HighlightResult;
        registerLanguage(languageName: string, languageDefinition: LanguageFn): void;
        getLanguage(languageName: string): Language | undefined;
    }
}

declare const hljs: hljs.HLJSApi;

export = hljs;
