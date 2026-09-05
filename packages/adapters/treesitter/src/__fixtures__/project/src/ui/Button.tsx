import { label } from "../core/service.js";

export interface ButtonProps {
  title: string;
}

export const Button = <T,>({ title }: ButtonProps): JSX.Element => <button>{label(title)}</button>;

export default function Panel() {
  return <div><Button title="x" /></div>;
}
