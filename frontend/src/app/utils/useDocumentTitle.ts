import * as React from 'react';
import { useTranslation } from 'react-i18next';

// a custom hook for setting the page title
export function useDocumentTitle(title: string) {
  const { t, i18n } = useTranslation();
  React.useEffect(() => {
    const originalTitle = document.title;
    document.title = t(title);

    return () => {
      document.title = originalTitle;
    };
  }, [title]);
}
