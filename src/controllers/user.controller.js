import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const registerUser = asyncHandler( async (req, res) => {
    // ---------get user details from frontend---------
    const { fullName, email, username, password } = req.body;
    console.log(fullName, ' ', email, ' ', password, );

    // ---------validation - not empty----------

    // if (fullName === "") {
    //     throw new ApiError(400, "fullname is required")
    // }
    if (
        [ fullName, email, username, password ].some((field)=> field?.trim() === "")
    ) {
        throw new ApiError(400, "fullname is required")
    }

    // ---------check if user already exists--------
    const existedUser = User.findOne({
        $or: [{ email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with email already exists")
    }

    // ---------check for images, check for avatar----------
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if(!avatarLocalPath) throw new ApiError(400, "Avatar is required");

    // ---------upload them to cloudinary, avatar--------
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!avatar) throw new ApiError(400, "Avatar is required");
    
    // ---------create user object - create entry in db----------
    const user = User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    })

    // ---------remove pass and refresh token field from response---------
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    // ---------check for user creation response-----------
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // ---------return res-----------
    return res.status(201).json(
        new ApiError(200, createdUser, "User created successfully")
    )

})

export { registerUser }