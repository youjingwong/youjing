import Link from "next/link";

interface BackToHomeLinkProps { }

const BackToHomeLink = ({ }: BackToHomeLinkProps): JSX.Element => {
  return (
    <div className="text-right">
      <Link href="/" className="underline">
        Back
      </Link>
    </div>
  );
};
export default BackToHomeLink;
