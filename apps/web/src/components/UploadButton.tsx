import { Upload } from 'lucide-react'

type Props = {
  onUpload: (files: FileList | null) => void
}

export default function UploadButton({ onUpload }: Props) {
  return (
    <label
      className="cursor-pointer rounded-full transition-all duration-300 hover:scale-110 focus-within:ring-2 focus-within:ring-[var(--lagoon)]"
      title="Upload books"
    >
      <span className="sr-only">Upload books</span>
      <Upload aria-hidden="true" />
      <input
        type="file"
        accept=".pdf,.txt"
        multiple
        className="sr-only"
        onChange={(e) => onUpload(e.target.files)}
      />
    </label>
  )
}
