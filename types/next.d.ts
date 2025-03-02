import React from 'react';

declare module 'next/head' {
  export default function Head(props: React.PropsWithChildren<{}>): JSX.Element;
} 