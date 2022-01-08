import React from "react";

interface TayarloProps {}

const Tayarlo = ({}: TayarloProps): JSX.Element => {
  return (
    <div className="container py-20">
      <h1>Tayarlo</h1>
      <div className="text-gray-400">
        Ruby on Rails · Native Android · Next.js · Cordova app · React
      </div>
      <a
        className="underline text-sm"
        href="https://www.tayarlo.com"
        target="_blank"
        rel="noreferrer"
      >
        Site Link
      </a>

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li>Custom built ERP</li>
        <li>
          Integration with Twilio, Unleashed Software, Shopify, Google
          Directions, Quickbooks, Firebase
        </li>
      </ul>

      <div className="mt-8"></div>
    </div>
  );
};
export default Tayarlo;
