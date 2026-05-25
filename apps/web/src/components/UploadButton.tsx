import { FaUpload } from 'react-icons/fa'
import { HiUpload } from 'react-icons/hi'
import { Upload } from 'lucide-react'

type Props = {
  onUpload: (files: FileList | null) => void
}

export default function UploadButton({ onUpload }: Props) {
  return (
    <label className="cursor-pointer transition-all duration-300 hover:scale-110">
      <Upload />
      <input
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => onUpload(e.target.files)}
      />
    </label>
  )
}
