import Image from "next/image";
import React from "react";
import fleetTracking from "../../public/work/tayarlo/fleet_tracking_and_dispatch.png";
import landingPage from "../../public/work/tayarlo/landing_page.png";
import warehouseManagement from "../../public/work/tayarlo/warehouse_management.png";
import warrantyManagement from "../../public/work/tayarlo/warranty_management.png";
import BackToHomeLink from "../../src/data/components/BackToHomeLink";

interface TayarloProps { }

const Tayarlo = ({ }: TayarloProps): React.JSX.Element => {
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

      <BackToHomeLink />

      <div className="pt-3"></div>
      <ul className="list-disc pl-5">
        <li>Custom built ERP</li>
        <li>Lead and primary developer</li>
        <li>
          Integration with Twilio, Unleashed Software, Shopify, Google
          Directions, Quickbooks, Firebase
        </li>
        <li>Landing page</li>
        <li>
          Sales and distribution module - Allows customer service officers to
          quote instantly and accurately
        </li>
        <li>
          Warehouse management module (Automated bin assignment, Inventory,
          Orders, Shipments, etc.) - Web & Android
        </li>
        <li>Fleet tracking and dispatch module - Web & Android</li>
        <li>
          Contact center module - Integration of Whatsapp API and Twilio VOIP
          calls
        </li>
        <li>Warranty management module</li>
        <li>Middleware integration with manufacturers</li>
      </ul>

      <div className="mt-8">
        <div className="mt-3">
          <h6>Landing Page</h6>
          <Image
            src={landingPage}
            alt="lading-page"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Warranty Management</h6>
          <Image
            src={warrantyManagement}
            alt="warranty-management"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Warehouse Management</h6>
          <Image
            src={warehouseManagement}
            alt="warehouse-management"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
        <div className="mt-3">
          <h6>Fleet Tracking and Dispatch</h6>
          <Image
            src={fleetTracking}
            alt="fleet-tracking"
            placeholder="blur"
            sizes="(min-width: 1024px) 1024px, 100vw"
            layout="responsive"
          />
        </div>
      </div>
    </div>
  );
};
export default Tayarlo;
