import Link from "next/link";

interface BackToHomeLinkProps {}

const BackToHomeLink = ({}: BackToHomeLinkProps): JSX.Element => {
  return (
    <div className="text-right">
      <Link href="/">
        <a className="underline">Back</a>
      </Link>
    </div>
  );
};
export default BackToHomeLink;
