import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { pathname, asPath, query, locale } = router;

  const changeLanguage = (newLocale: string) => {
    router.push({ pathname, query }, asPath, { locale: newLocale });
  };

  return (
    <div className="flex items-center space-x-2 text-sm flex-wrap">
      <span className="text-gray-400">{t('language')}:</span>
      <button
        onClick={() => changeLanguage('en')}
        className={`px-2 py-1 rounded ${locale === 'en' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        English
      </button>
      <button
        onClick={() => changeLanguage('ms')}
        className={`px-2 py-1 rounded ${locale === 'ms' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        Bahasa Melayu
      </button>
      <button
        onClick={() => changeLanguage('zh')}
        className={`px-2 py-1 rounded ${locale === 'zh' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
      >
        中文
      </button>
    </div>
  );
} 