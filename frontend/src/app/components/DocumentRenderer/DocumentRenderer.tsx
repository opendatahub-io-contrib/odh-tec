import * as React from 'react';
import { CodeEditor, Language } from '@patternfly/react-code-editor';

type DocumentRendererProps = {
    fileData: string;
    fileName: string;
};

const getLanguageFromExtension = (extension: string) => {
    switch (extension) {
        case 'js':
            return Language.javascript;
        case 'jsx':
            return Language.javascript;
        case 'ts':
            return Language.typescript;
        case 'tsx':
            return Language.typescript;
        case 'py':
            return Language.python;
        case 'Dockerfile':
            return Language.dockerfile;
        case 'Containerfile':
            return Language.dockerfile;
        case 'java':
            return Language.java;
        case 'xml':
            return Language.xml;
        case 'json':
            return Language.json;
        case 'yaml':
            return Language.yaml;
        case 'yml':
            return Language.yaml;
        case 'sh':
            return Language.shell;
        case 'bash':
            return Language.shell;
        case 'md':
            return Language.markdown;
        case 'html':
            return Language.html;
        case 'css':
            return Language.css;
        // Add more cases as needed
        default:
            return Language.plaintext;
    }
}

const DocumentRenderer: React.FC<DocumentRendererProps> = ({ fileData, fileName }) => {
    console.log('fileName: ', fileName);
    const imagesExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
    const textFilesExtensions = ['txt', 'md', 'html', 'css', 'scss', 'js', 'jsx', 'ts','tsx', 'json', 'xml', 'yml', 'yaml', 'java', 'py', 'go', 'php', 'rb', 'sh', 'bat', 'ps1', 'psm1', 'psd1', 'ps1xml', 'clj', 'cljc', 'cljs', 'edn', 'r', 'rmd', 'cs', 'csx', 'fs', 'fsx', 'fsi', 'vb', 'vbs', 'vba', 'sql', 'pl', 'pm', 't', 'rs', 'toml', 'ini', 'cfg', 'conf', 'cnf', 'env', 'properties', 'csv', 'tsv', 'log', 'gitignore', 'gitattributes', 'editorconfig', 'babelrc', 'eslintrc', 'prettierrc', 'dockerignore', 'dockerfile']
    if (imagesExtensions.includes(fileName?.split('.').pop() || '')) {
        return <img src={`data:${fileName};base64,${fileData}`} alt="image" />;
    } else if (textFilesExtensions.includes(fileName?.split('.').pop() || '')) {
        return <CodeEditor
            isLineNumbersVisible={true}
            isReadOnly={true}
            code={atob(fileData)}
            isLanguageLabelVisible
            language={getLanguageFromExtension(fileName.split('.').pop() || '')}
            height="sizeToFit"
        />;
    } else {
        return <p>Unsupported file type</p>;
    }
}

export default DocumentRenderer;