// This is your Google Analytics 4 Measurement ID
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || '';

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    const pageUrl = new URL(url, window.location.origin);
    const pageLocation = `${pageUrl.origin}${pageUrl.pathname}`;

    (window as any).gtag('config', GA_MEASUREMENT_ID, {
      page_path: pageUrl.pathname,
      page_location: pageLocation,
    });
  }
};

export const disable = () => {
  if (typeof window !== 'undefined' && GA_MEASUREMENT_ID) {
    (window as any)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  }
};

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const event = ({ action, category, label, value }: {
  action: string;
  category: string;
  label: string;
  value?: number;
}) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};
