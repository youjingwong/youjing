import { useTranslation } from 'next-i18next/pages';
import { useRouter } from 'next/router';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { pathname, asPath, query, locale } = router;

  const changeLanguage = (newLocale: string) => {
    const safeQuery = { ...query };
    delete safeQuery.text;

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('text');
    const cleanAsPath = `${asPath.split(/[?#]/, 1)[0]}${currentUrl.search}${currentUrl.hash}`;

    router.push({ pathname, query: safeQuery }, cleanAsPath, { locale: newLocale });
  };

  return (
    <div className="flex items-center justify-center sm:justify-start gap-x-2 text-sm flex-wrap">
      <span className="text-gray-400">{t('language')}:</span>
      <button
        onClick={() => changeLanguage('en')}
        className={`px-2 py-1 rounded-sm ${locale === 'en' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        English
      </button>
      <button
        onClick={() => changeLanguage('ms')}
        className={`px-2 py-1 rounded-sm ${locale === 'ms' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        Bahasa Melayu
      </button>
      <button
        onClick={() => changeLanguage('zh')}
        className={`px-2 py-1 rounded-sm ${locale === 'zh' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        中文
      </button>
    </div>
  );
}
